import { segmentDurationFrames } from '@video-toolkit/lib/reel-config-base/duration';
import styles from './Timeline.module.css';

/**
 * Structural segment shape — only the fields `segmentDurationFrames` reads.
 * Deliberately not importing the full reel-config-base segment union so this
 * component stays decoupled from any one template's segment variants.
 */
export type Segment = {
  id: string;
  type: string;
  source?: string;
  trimIn?: number;
  trimOut?: number;
  durationMs?: number;
};

export interface TimelineProps {
  segments: Segment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fps: number;
  outroFrames: number;
}

function labelFor(seg: Segment, index: number): string {
  return seg.type === 'outro' ? 'outro' : `${seg.type} · ${index + 1}`;
}

/**
 * Timeline — horizontal strip of scene blocks, one per segment.
 *
 * Presentational and controlled: no internal state. Each block's flex-grow
 * is proportional to its duration in frames (via `segmentDurationFrames`),
 * so the strip reads as a proportional scrubber even without a shared pixels-
 * per-frame scale. Clicking a block reports its id via `onSelect`; the
 * currently selected segment is styled distinctly.
 */
export function Timeline({ segments, selectedId, onSelect, fps, outroFrames }: TimelineProps) {
  return (
    <div className={styles.timeline}>
      {segments.map((seg, index) => {
        const durationFrames = segmentDurationFrames(seg, fps, outroFrames);
        const isSelected = seg.id === selectedId;
        return (
          <button
            key={seg.id}
            type="button"
            className={isSelected ? `${styles.block} ${styles.selected}` : styles.block}
            style={{ flexGrow: durationFrames, flexBasis: 0 }}
            data-duration-frames={durationFrames}
            onClick={() => onSelect(seg.id)}
            title={labelFor(seg, index)}
          >
            <span className={styles.label}>{labelFor(seg, index)}</span>
          </button>
        );
      })}
    </div>
  );
}
