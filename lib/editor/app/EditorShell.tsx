import { useEffect, type ReactNode } from 'react';
import styles from './EditorShell.module.css';

// Clean curved undo/redo glyphs (Lucide undo-2 / redo-2) — the bare ↶/↷ unicode
// arrows render inconsistently across platforms.
const iconProps = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const UndoIcon = () => (
  <svg {...iconProps} aria-hidden="true">
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11" />
  </svg>
);
const RedoIcon = () => (
  <svg {...iconProps} aria-hidden="true">
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13" />
  </svg>
);

export interface EditorShellProps {
  /** The mounted preview (e.g. a Remotion <Player>), supplied by the caller. */
  preview: ReactNode;
  /** Project name shown in the header. */
  projectName?: string;
  /** Called when the Save button is clicked. */
  onSave?: () => void;
  /** Called when the Discard button is clicked — revert unsaved edits. */
  onDiscard?: () => void;
  /** Disables the Save button while a save is in flight. */
  saving?: boolean;
  /** Whether there are unsaved edits. Shows an "unsaved" indicator and makes Save look actionable. */
  dirty?: boolean;
  /** Rendered in the right panel. Falls back to a placeholder when omitted. */
  inspector?: ReactNode;
  /** Rendered in the bottom strip. Falls back to a placeholder when omitted. */
  timeline?: ReactNode;
  /** Prominent render controls (e.g. Preview/Full) shown at the top of the header. */
  renderControls?: ReactNode;
  /** Undo/redo (multi-step). Buttons show when the handlers are provided. */
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
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
  onDiscard,
  saving,
  dirty,
  inspector,
  timeline,
  renderControls,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: EditorShellProps) {
  // ⌘S / Ctrl+S saves (and always suppresses the browser's own save dialog),
  // even while typing in a field. Shared here so every brand's editor gets it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (onSave && !saving) onSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave, saving]);

  return (
    <div className={styles.shell}>
      {/* Global reset so the editor fills the viewport with no white page frame.
          Templates that ship their own global.css already do this; templates
          without one relied on the browser default body
          margin, which showed as a white border around the UI. */}
      <style>{`html, body, #root { height: 100%; margin: 0; } body { background: #0a0a0a; }`}</style>
      <header className={styles.header}>
        <span className={styles.projectName}>{projectName}</span>
        <div className={styles.saveGroup}>
          {renderControls && (
            <>
              {renderControls}
              <span className={styles.divider} />
            </>
          )}
          {(onUndo || onRedo) && (
            <>
              <button type="button" className={styles.iconButton} onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)">
                <UndoIcon /> Undo
              </button>
              <button type="button" className={styles.iconButton} onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)">
                <RedoIcon /> Redo
              </button>
              <span className={styles.divider} />
            </>
          )}
          {/* Always occupies its space (visibility, not conditional render) so
              toggling dirty never shifts the Save/Discard buttons. */}
          <span className={styles.unsavedIndicator} style={{ visibility: dirty ? 'visible' : 'hidden' }}>
            ● Unsaved
          </span>
          {/* Save + Discard are always present; both disable when there's nothing to save. */}
          <button type="button" className={styles.discardButton} onClick={onDiscard} disabled={!dirty || saving}>
            Discard
          </button>
          <button
            type="button"
            className={dirty ? styles.saveButton : `${styles.saveButton} ${styles.saveButtonClean}`}
            onClick={onSave}
            disabled={!dirty || saving}
          >
            Save
          </button>
        </div>
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
