import { useEffect, useRef } from 'react';
import styles from './Inspector.module.css';
import { wrapAccent, type AccentColor } from './accent';

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
 * Inspector — reel-level fields + selected-scene editing for the reel editor.
 *
 * Presentational and controlled: no persisted internal state, only a
 * transient ref used to restore text-input selection after an accent wrap.
 * With no selection, shows a Reel section with Topic/Chevron text inputs
 * bound to `topic`/`chevron`/`onReelChange`. With a selected segment, shows
 * the read-only Scene summary (type, source, timing) plus editable audioMode
 * and overlay text (with Lime/Teal accent buttons) via `onSegmentChange`.
 */
export function Inspector({
  segments,
  selectedId,
  topic,
  chevron,
  onReelChange,
  onSegmentChange,
}: InspectorProps) {
  const selected = selectedId === null ? undefined : segments.find((s) => s.id === selectedId);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingSelection = useRef<{ key: string; start: number; end: number } | null>(null);

  useEffect(() => {
    const pending = pendingSelection.current;
    if (!pending) return;
    const el = inputRefs.current[pending.key];
    if (el) {
      el.setSelectionRange(pending.start, pending.end);
    }
    pendingSelection.current = null;
  });

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

  const handleAccent = (entry: OverlayEntry, color: AccentColor) => {
    const el = inputRefs.current[entry.key];
    const selStart = el?.selectionStart ?? entry.text.length;
    const selEnd = el?.selectionEnd ?? entry.text.length;
    const result = wrapAccent(entry.text, selStart, selEnd, color);
    pendingSelection.current = { key: entry.key, start: result.selStart, end: result.selEnd };
    onSegmentChange(selected.id, entry.toPatch(result.text));
  };

  return (
    <div className={styles.inspector}>
      <h2 className={styles.heading}>Scene</h2>
      <div className={styles.field}>
        <span className={styles.label}>Type</span>
        <span className={styles.value}>{selected.type}</span>
      </div>
      {selected.source && (
        <div className={styles.field}>
          <span className={styles.label}>Source</span>
          <span className={styles.value}>{selected.source}</span>
        </div>
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
            <input
              type="text"
              className={styles.input}
              value={entry.text}
              ref={(el) => {
                inputRefs.current[entry.key] = el;
              }}
              onChange={(e) => onSegmentChange(selected.id, entry.toPatch(e.target.value))}
            />
            <div className={styles.accentButtons}>
              <button
                type="button"
                className={styles.accentButton}
                onClick={() => handleAccent(entry, 'lime')}
              >
                Lime
              </button>
              <button
                type="button"
                className={styles.accentButton}
                onClick={() => handleAccent(entry, 'teal')}
              >
                Teal
              </button>
            </div>
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
