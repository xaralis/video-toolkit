import styles from './Inspector.module.css';

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
};

export interface InspectorProps {
  segments: Segment[];
  selectedId: string | null;
  topic: string;
  onTopicChange: (v: string) => void;
}

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

/**
 * Inspector — reel-level field + selected-scene summary for the reel editor.
 *
 * Presentational and controlled: no internal state. With no selection, shows
 * a Reel section with a Topic text input bound to `topic`/`onTopicChange`.
 * With a selected segment, shows a read-only Scene summary (type, source,
 * timing in seconds). Editable segment fields land in a later checkpoint.
 */
export function Inspector({ segments, selectedId, topic, onTopicChange }: InspectorProps) {
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
            onChange={(e) => onTopicChange(e.target.value)}
          />
        </label>
      </div>
    );
  }

  const timing = timingFor(selected);

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
    </div>
  );
}
