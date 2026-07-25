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
}

/**
 * EditorShell — layout A (classic NLE) for the reel editor.
 *
 * Presentational only: header (project name + Save), a top row with the
 * caller-supplied preview stage on the left and an inspector placeholder on
 * the right, and a full-width timeline placeholder strip below. Has no
 * Remotion/composition dependency of its own — the `preview` node is mounted
 * by the caller.
 */
export function EditorShell({ preview, projectName, onSave, saving }: EditorShellProps) {
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
        <div className={styles.inspector}>Inspektor (příště)</div>
      </div>

      <div className={styles.timeline}>Timeline (příště)</div>
    </div>
  );
}
