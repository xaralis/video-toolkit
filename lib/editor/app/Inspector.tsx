import styles from './Inspector.module.css';
import { AccentEditor } from './AccentEditor';

/**
 * A single overlay entry. Deliberately loose (not the full reel-config-base
 * overlay union) so this component stays decoupled from any one template's
 * overlay variants — only `kind` and an optional `text` are relied upon.
 */
export type Overlay = {
  kind: string;
  text?: string;
  [key: string]: unknown;
};

/**
 * Structural segment shape — mirrors Timeline's `Segment`. Deliberately not
 * importing the full reel-config-base segment union so this component stays
 * decoupled from any one template's segment variants.
 */
export type Segment = {
  id: string;
  type: string;
  source?: string;
  trimIn?: number;
  trimOut?: number;
  durationMs?: number;
  audioMode?: string;
  /** clip segments: multiple overlays */
  overlays?: Overlay[];
  /** broll segments: a single overlay */
  overlay?: Overlay;
};

export interface InspectorProps {
  segments: Segment[];
  selectedId: string | null;
  topic: string;
  chevron: string;
  onReelChange: (patch: { topic?: string; chevron?: string }) => void;
  onSegmentChange: (id: string, patch: Record<string, unknown>) => void;
  /** Available footage filenames, supplied by the template from the project's public dirs. */
  sources?: { recordings: string[]; broll: string[] };
}

/** Allowed `audioMode` values per segment type — mirrors reel-config-base's base-types.ts. */
const AUDIO_MODE_OPTIONS: Record<string, string[]> = {
  clip: ['voice', 'silent'],
  broll: ['silent', 'extend-previous', 'inherit-from-clip'],
  'multi-clip': ['first', 'mix', 'silent'],
};

/** Formats a segment's timing in seconds, or null when there's nothing to show. */
function timingFor(seg: Segment): string | null {
  if (
    (seg.type === 'clip' || seg.type === 'broll') &&
    seg.trimIn !== undefined &&
    seg.trimOut !== undefined
  ) {
    const duration = seg.trimOut - seg.trimIn;
    return `${seg.trimIn.toFixed(1)}s → ${seg.trimOut.toFixed(1)}s · ${duration.toFixed(1)}s`;
  }
  if ((seg.type === 'multi-clip' || seg.type === 'card') && seg.durationMs !== undefined) {
    return `${(seg.durationMs / 1000).toFixed(1)}s`;
  }
  return null;
}

/** A text-bearing overlay resolved for editing, plus how to fold an edited text back into a patch. */
interface OverlayEntry {
  key: string;
  text: string;
  toPatch: (newText: string) => Record<string, unknown>;
}

/** Resolves the text-bearing overlay(s) on a segment, per its type's overlay shape (clip: array, broll: single). */
function overlayEntriesFor(seg: Segment): OverlayEntry[] {
  if (seg.type === 'clip' && Array.isArray(seg.overlays)) {
    const overlays = seg.overlays;
    return overlays
      .map((ov, idx) => ({ ov, idx }))
      .filter((entry): entry is { ov: Overlay & { text: string }; idx: number } => typeof entry.ov.text === 'string')
      .map(({ ov, idx }) => ({
        key: `overlay-${idx}`,
        text: ov.text,
        toPatch: (newText: string) => ({
          overlays: overlays.map((o, i) => (i === idx ? { ...o, text: newText } : o)),
        }),
      }));
  }
  if (seg.type === 'broll' && seg.overlay) {
    const overlay = seg.overlay;
    const text = overlay.text;
    if (typeof text === 'string') {
      return [
        {
          key: 'broll-overlay',
          text,
          toPatch: (newText: string) => ({ overlay: { ...overlay, text: newText } }),
        },
      ];
    }
  }
  return [];
}

/**
 * Resolves the selectable source filenames for a clip/broll segment: the
 * template-supplied list for its footage kind (recordings for clips, broll
 * for brolls), plus the segment's current `source` if it isn't already in
 * that list (so the select never loses the segment's actual footage).
 * Returns null for segment types that don't carry a source at all.
 */
function sourceOptionsFor(
  seg: Segment,
  sources?: { recordings: string[]; broll: string[] }
): string[] | null {
  if (seg.type !== 'clip' && seg.type !== 'broll') return null;
  const available = seg.type === 'clip' ? sources?.recordings : sources?.broll;
  const options = available ? [...available] : [];
  if (seg.source && !options.includes(seg.source)) {
    options.push(seg.source);
  }
  return options;
}

/**
 * Inspector — reel-level fields + selected-scene editing for the reel editor.
 *
 * Presentational and controlled: no persisted internal state. With no
 * selection, shows a Reel section with Topic/Chevron text inputs bound to
 * `topic`/`chevron`/`onReelChange`. With a selected segment, shows the
 * read-only Scene summary (type, timing) plus editable Source (clip/broll
 * only, via `sources`), audioMode, and overlay text (via a WYSIWYG
 * `AccentEditor`) via `onSegmentChange`.
 */
export function Inspector({
  segments,
  selectedId,
  topic,
  chevron,
  onReelChange,
  onSegmentChange,
  sources,
}: InspectorProps) {
  const selected = selectedId === null ? undefined : segments.find((s) => s.id === selectedId);

  if (!selected) {
    return (
      <div className={styles.inspector}>
        <h2 className={styles.heading}>Reel</h2>
        <label className={styles.field}>
          <span className={styles.label}>Topic</span>
          <input
            type="text"
            className={styles.input}
            value={topic}
            onChange={(e) => onReelChange({ topic: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Chevron</span>
          <input
            type="text"
            className={styles.input}
            value={chevron}
            onChange={(e) => onReelChange({ chevron: e.target.value })}
          />
        </label>
      </div>
    );
  }

  const timing = timingFor(selected);
  const audioOptions = AUDIO_MODE_OPTIONS[selected.type];
  const overlayEntries = overlayEntriesFor(selected);
  const sourceOptions = sourceOptionsFor(selected, sources);

  return (
    <div className={styles.inspector}>
      <h2 className={styles.heading}>Scene</h2>
      <div className={styles.field}>
        <span className={styles.label}>Type</span>
        <span className={styles.value}>{selected.type}</span>
      </div>
      {sourceOptions && sourceOptions.length > 0 && (
        <label className={styles.field}>
          <span className={styles.label}>Source</span>
          <select
            className={styles.input}
            value={selected.source ?? sourceOptions[0]}
            onChange={(e) => onSegmentChange(selected.id, { source: e.target.value })}
          >
            {sourceOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      )}
      {timing && (
        <div className={styles.field}>
          <span className={styles.label}>Timing</span>
          <span className={styles.value}>{timing}</span>
        </div>
      )}

      {audioOptions && (
        <label className={styles.field}>
          <span className={styles.label}>Audio</span>
          <select
            className={styles.input}
            value={selected.audioMode ?? audioOptions[0]}
            onChange={(e) => onSegmentChange(selected.id, { audioMode: e.target.value })}
          >
            {audioOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      )}

      {overlayEntries.length > 0 ? (
        overlayEntries.map((entry) => (
          <div className={styles.field} key={entry.key}>
            <span className={styles.label}>Overlay text</span>
            <AccentEditor
              value={entry.text}
              onChange={(next) => onSegmentChange(selected.id, entry.toPatch(next))}
            />
          </div>
        ))
      ) : (
        <div className={styles.field}>
          <span className={styles.note}>no overlay text</span>
        </div>
      )}
    </div>
  );
}
