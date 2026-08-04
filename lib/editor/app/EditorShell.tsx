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
  /** Whether there are unsaved edits. Shows an "unsaved" indicator and makes Save look actionable. */
  dirty?: boolean;
  /** A `<DiagnosticsBadge>` (or any indicator) shown in the header beside the
   *  project name. Omitted entirely (not a placeholder) when the caller has
   *  nothing to show — a healthy project's header looks exactly as it did
   *  before this existed. */
  diagnostics?: ReactNode;
  /** The project-phase chip, shown beside the project name (left zone) —
   *  it describes the project, not an action, so it does not belong among
   *  the render/undo/save controls on the right. Omitted entirely when the
   *  caller has no phase control to show. */
  phaseControl?: ReactNode;
  /** Rendered in the right panel. Falls back to a placeholder when omitted. */
  inspector?: ReactNode;
  /** Rendered in the bottom strip. Falls back to a placeholder when omitted. */
  timeline?: ReactNode;
  /** Prominent render controls (e.g. a Preview|Full segmented control) shown
   *  at the front of the header's action zone. */
  renderControls?: ReactNode;
  /** A dismissible status (finished render, error) overlaid on the editor
   *  body — never in the header, so it can't shove the action controls or
   *  block a second render from starting. Omitted entirely when there's
   *  nothing to report. */
  renderStatus?: ReactNode;
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
  phaseControl,
  inspector,
  timeline,
  renderControls,
  renderStatus,
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
        {/* Identity + health + document state: what this PROJECT is, whether
            it has unsaved edits, and whether it's okay. None of this is an
            action, so it stays out of the right zone — and this side is
            left-aligned, so the unsaved dot + Discard growing in here (only
            while dirty) pushes into empty space, never into a control that
            has to hold still. The conventional home for a dirty indicator is
            beside the document's own identity (a tab's dirty dot, "All
            changes saved" beside a doc title) — not the toolbar. */}
        <div className="ed:flex ed:items-center ed:gap-3">
          <span className="ed:text-sm ed:font-semibold ed:text-ink">{projectName}</span>
          {dirty && <span className="ed:text-xs ed:font-medium ed:text-warn">● Unsaved</span>}
          {dirty && (
            <button
              type="button"
              className="ed:bg-transparent ed:text-ink-2 ed:border ed:border-line-strong ed:rounded-md ed:px-[14px] ed:py-2 ed:text-[13px] ed:cursor-pointer ed:hover:border-ink-3 ed:hover:text-ink ed:disabled:opacity-45 ed:disabled:cursor-default"
              onClick={onDiscard}
              disabled={saving}
            >
              Discard
            </button>
          )}
          {phaseControl}
          {diagnostics}
        </div>
        {/* Actions: things you DO. This zone's control SET never changes with
            dirty state — only Save's own look (accent+enabled vs neutral+
            disabled) does — so Preview|Full and Undo/Redo never shift
            position when the reel becomes dirty. */}
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
          {/* Save is always present, unconditionally — the only control in
              this zone whose STYLE (not presence) reflects dirty state. */}
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

      <div className="ed:relative ed:flex ed:flex-col ed:flex-1 ed:min-h-0">
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

        {/* Overlays the editor body (preview + inspector + timeline), never
            the header — a finished render or an error must not shove the
            action controls. `pointer-events-none` on the full-bleed
            positioning layer, `pointer-events-auto` on just the toast box,
            mirrors MediaLoadingOverlay's own solved pattern (host/MediaLoading.tsx)
            for "covers an area but must not swallow clicks under it". */}
        {renderStatus && (
          <div className="ed:absolute ed:inset-0 ed:z-20 ed:flex ed:items-end ed:justify-end ed:p-4 ed:pointer-events-none">
            <div className="ed:pointer-events-auto">{renderStatus}</div>
          </div>
        )}
      </div>
    </div>
  );
}
