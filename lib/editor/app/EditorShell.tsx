import type { ReactNode } from 'react';
import './editor.css';
import { UndoIcon, RedoIcon } from './icons';

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
  /** Whether there are unsaved edits. Makes Save look actionable and enables
   *  Discard (which stays rendered, just disabled, when there's nothing to
   *  discard — a disabled real button, not a hidden one). */
  dirty?: boolean;
  /** The single health/status chip — saved / unsaved / issue, fixed size in
   *  every state. Shown in the action zone, immediately before Discard.
   *  Replaces the old separate diagnostics badge AND unsaved-text indicator:
   *  one indicator for the document's state, not two competing ones. */
  statusChip?: ReactNode;
  /** The project-phase chip, shown beside the project name (left zone) —
   *  it describes the project, not an action, so it does not belong among
   *  the render/undo/save controls on the right. Omitted entirely when the
   *  caller has no phase control to show. */
  phaseControl?: ReactNode;
  /** Rendered in the right panel. Falls back to a placeholder when omitted. */
  inspector?: ReactNode;
  /** Rendered in the bottom strip. Falls back to a placeholder when omitted. */
  timeline?: ReactNode;
  /** The render control (a single "Render ▾" button that owns its whole
   *  lifecycle — menu, progress, done, error) shown at the front of the
   *  header's action zone. */
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
  statusChip,
  phaseControl,
  inspector,
  timeline,
  renderControls,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: EditorShellProps) {
  // ⌘S / Ctrl+S is wired by the host through `useShortcuts` (see
  // `app/shortcuts.ts` / `app/useShortcuts.ts`) — the shell itself no longer
  // owns a keydown listener.
  return (
    <div className="ed:flex ed:flex-col ed:h-screen ed:bg-shell ed:text-ink ed:font-sans">
      {/* Global reset so the editor fills the viewport with no white page frame.
          Templates that ship their own global.css already do this; templates
          without one relied on the browser default body
          margin, which showed as a white border around the UI. */}
      <style>{`html, body, #root { height: 100%; margin: 0; } body { background: var(--ed-color-stage); }`}</style>
      <header className="ed:flex ed:items-center ed:justify-between ed:px-5 ed:py-3 ed:bg-panel ed:border-b ed:border-line ed:shrink-0">
        {/* Identity: what this PROJECT is. No document state lives here any
            more — a fixed-size status chip and Save/Discard cover that, both
            in the action zone, so nothing on this side ever changes width. */}
        <div className="ed:flex ed:items-center ed:gap-3">
          <span className="ed:text-sm ed:font-semibold ed:text-ink">{projectName}</span>
          {phaseControl}
        </div>
        {/* Actions: things you DO, plus the document's health/state — the
            status chip is fixed-size across all three of its states, and
            Discard is always rendered (disabled when clean, not hidden), so
            this zone's width never changes with dirty/diagnostic state. */}
        <div data-testid="action-zone" className="ed:flex ed:items-center ed:gap-3">
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
                className="ed:inline-flex ed:items-center ed:justify-center ed:bg-transparent ed:text-ink-2 ed:border ed:border-line-strong ed:rounded-md ed:w-8 ed:h-8 ed:cursor-pointer ed:hover:not-disabled:text-ink ed:disabled:opacity-40 ed:disabled:cursor-default"
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo (⌘Z)"
                aria-label="Undo"
              >
                <UndoIcon size={15} />
              </button>
              <button
                type="button"
                className="ed:inline-flex ed:items-center ed:justify-center ed:bg-transparent ed:text-ink-2 ed:border ed:border-line-strong ed:rounded-md ed:w-8 ed:h-8 ed:cursor-pointer ed:hover:not-disabled:text-ink ed:disabled:opacity-40 ed:disabled:cursor-default"
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo (⌘⇧Z)"
                aria-label="Redo"
              >
                <RedoIcon size={15} />
              </button>
              <span className="ed:w-px ed:h-[22px] ed:bg-line ed:mx-0.5" />
            </>
          )}
          {statusChip}
          {/* Always rendered — disabled, not hidden, when there's nothing to
              discard. An honest disabled control, unlike the invisible
              placeholder this replaced; the zone's width is identical in
              every dirty state either way. */}
          <button
            type="button"
            className="ed:bg-transparent ed:text-ink-2 ed:border ed:border-line-strong ed:rounded-md ed:px-[14px] ed:py-2 ed:text-[13px] ed:cursor-pointer ed:hover:not-disabled:border-ink-3 ed:hover:not-disabled:text-ink ed:disabled:opacity-45 ed:disabled:cursor-default"
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
