import type { ReactNode } from 'react';
import styles from './EditorShell.module.css';

export interface EditorShellProps {
  /** The mounted preview (e.g. a Remotion <Player>), supplied by the caller. */
  preview: ReactNode;
  /** Project name shown in the header. */
  projectName?: string;
  /** Called when the Save button is clicked. */
  onSave?: () => void;
  /** Disables the Save button while a save is in flight. */
  saving?: boolean;
  /** Rendered in the right panel. Falls back to a placeholder when omitted. */
  inspector?: ReactNode;
  /** Rendered in the bottom strip. Falls back to a placeholder when omitted. */
  timeline?: ReactNode;
}

/**
 * EditorShell — layout A (classic NLE) for the reel editor.
 *
 * Presentational only: header (project name + Save), a top row with the
 * caller-supplied preview stage on the left and an `inspector` slot on the
 * right, and a full-width `timeline` slot strip below. Both slots fall back
 * to "coming soon" placeholders when omitted. Has no Remotion/composition
 * dependency of its own — the `preview` node is mounted by the caller.
 */
export function EditorShell({
  preview,
  projectName,
  onSave,
  saving,
  inspector,
  timeline,
}: EditorShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.projectName}>{projectName}</span>
        <button
          type="button"
          className={styles.saveButton}
          onClick={onSave}
          disabled={saving}
        >
          Save
        </button>
      </header>

      <div className={styles.main}>
        <div className={styles.stage}>
          <div className={styles.stageFrame}>{preview}</div>
        </div>
        <div className={styles.inspector}>{inspector ?? 'Inspector (coming soon)'}</div>
      </div>

      <div className={styles.timeline}>{timeline ?? 'Timeline (coming soon)'}</div>
    </div>
  );
}
