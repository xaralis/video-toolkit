import { useEffect, type ReactNode } from 'react';
import './editor.css';

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
  /** A `<DiagnosticsBadge>` (or any indicator) shown in the header beside the
   *  project name. Omitted entirely (not a placeholder) when the caller has
   *  nothing to show — a healthy project's header looks exactly as it did
   *  before this existed. */
  diagnostics?: ReactNode;
  /** Rendered in the right panel. Falls back to a placeholder when omitted. */
  inspector?: ReactNode;
  /** Rendered in the bottom strip. Falls back to a placeholder when omitted. */
  timeline?: ReactNode;
  /** Prominent render controls (e.g. Preview/Full) shown at the top of the header. */
  renderControls?: ReactNode;
  /** The preview stage's aspect ratio, as a CSS `aspect-ratio` value (e.g.
   *  `'16 / 9'`). Defaults to `'9 / 16'` — the shell was built for vertical
   *  reels and hard-coded that, which letterboxed a 1920×1080 web-program-intro
   *  into a portrait box. The caller knows its composition's dimensions; this
   *  is how it says so. */
  aspectRatio?: string;
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
  aspectRatio = '9 / 16',
  projectName,
  onSave,
  onDiscard,
  saving,
  dirty,
  diagnostics,
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
    <div className="ed:flex ed:flex-col ed:h-screen ed:bg-shell ed:text-ink ed:font-sans">
      {/* Global reset so the editor fills the viewport with no white page frame.
          Templates that ship their own global.css already do this; templates
          without one relied on the browser default body
          margin, which showed as a white border around the UI. */}
      <style>{`html, body, #root { height: 100%; margin: 0; } body { background: var(--ed-color-stage); }`}</style>
      <header className="ed:flex ed:items-center ed:justify-between ed:px-5 ed:py-3 ed:bg-panel ed:border-b ed:border-line ed:shrink-0">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="ed:text-sm ed:font-semibold ed:text-ink">{projectName}</span>
          {diagnostics}
        </div>
        <div className="ed:flex ed:items-center ed:gap-3">
          {renderControls && (
            <>
              {renderControls}
              <span className="ed:w-px ed:h-[22px] ed:bg-line ed:mx-0.5" />
            </>
          )}
          {(onUndo || onRedo) && (
            <>
              <button
                type="button"
                className="ed:inline-flex ed:items-center ed:gap-1.5 ed:bg-transparent ed:text-ink-2 ed:border ed:border-line-strong ed:rounded-md ed:px-3 ed:py-[7px] ed:text-[13px] ed:cursor-pointer ed:hover:not-disabled:text-ink ed:disabled:opacity-40 ed:disabled:cursor-default"
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo (⌘Z)"
              >
                <UndoIcon /> Undo
              </button>
              <button
                type="button"
                className="ed:inline-flex ed:items-center ed:gap-1.5 ed:bg-transparent ed:text-ink-2 ed:border ed:border-line-strong ed:rounded-md ed:px-3 ed:py-[7px] ed:text-[13px] ed:cursor-pointer ed:hover:not-disabled:text-ink ed:disabled:opacity-40 ed:disabled:cursor-default"
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo (⌘⇧Z)"
              >
                <RedoIcon /> Redo
              </button>
              <span className="ed:w-px ed:h-[22px] ed:bg-line ed:mx-0.5" />
            </>
          )}
          {/* Always occupies its space (visibility, not conditional render) so
              toggling dirty never shifts the Save/Discard buttons. */}
          <span
            className="ed:text-xs ed:font-medium ed:text-warn"
            style={{ visibility: dirty ? 'visible' : 'hidden' }}
          >
            ● Unsaved
          </span>
          {/* Save + Discard are always present; both disable when there's nothing to save. */}
          <button
            type="button"
            className="ed:bg-transparent ed:text-ink-2 ed:border ed:border-line-strong ed:rounded-md ed:px-[14px] ed:py-2 ed:text-[13px] ed:cursor-pointer ed:hover:border-ink-3 ed:hover:text-ink ed:disabled:opacity-45 ed:disabled:cursor-default"
            onClick={onDiscard}
            disabled={!dirty || saving}
          >
            Discard
          </button>
          <button
            type="button"
            className={
              dirty
                ? 'ed:bg-accent ed:text-accent-ink ed:border-0 ed:rounded-md ed:px-[18px] ed:py-2 ed:text-[13px] ed:font-semibold ed:cursor-pointer ed:disabled:bg-control ed:disabled:text-ink-3 ed:disabled:cursor-default'
                : 'ed:bg-accent ed:text-accent-ink ed:border-0 ed:rounded-md ed:px-[18px] ed:py-2 ed:text-[13px] ed:font-semibold ed:cursor-pointer ed:disabled:bg-control ed:disabled:text-ink-3 ed:disabled:cursor-default ed:bg-control ed:text-ink-3 ed:cursor-default'
            }
            onClick={onSave}
            disabled={!dirty || saving}
          >
            Save
          </button>
        </div>
      </header>

      <div className="ed:flex ed:flex-1 ed:min-h-0">
        <div className="ed:flex ed:items-center ed:justify-center ed:flex-1 ed:min-w-0 ed:bg-stage ed:p-6">
          <div
            data-testid="stage-frame"
            className="ed:h-full ed:max-w-full ed:bg-black ed:overflow-hidden ed:rounded ed:shadow-[0_0_0_1px_var(--ed-color-line)]"
            style={{ aspectRatio }}
          >
            {preview}
          </div>
        </div>
        <div className="ed:w-80 ed:shrink-0 ed:bg-panel ed:border-l ed:border-line ed:overflow-hidden ed:text-ink-3 ed:text-[13px]">
          {inspector ?? 'Inspector (coming soon)'}
        </div>
      </div>

      <div className="ed:h-[300px] ed:shrink-0 ed:bg-panel ed:border-t ed:border-line ed:flex ed:items-center ed:justify-center ed:text-ink-3 ed:text-[13px]">
        {timeline ?? 'Timeline (coming soon)'}
      </div>
    </div>
  );
}
