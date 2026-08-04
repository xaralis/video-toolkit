import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, ChevronDownIcon, TriangleAlertIcon, XIcon } from './icons';

/**
 * "Render" control for the editor's header toolbar, plus the project
 * lifecycle control.
 *
 * Talks to the dev-server's `/render` endpoint (`createRenderHandler`, see
 * `lib/editor/src/render-endpoint.ts`): POSTs `{ mode }` to kick off a real
 * Remotion render, then polls GET `/render` once a second for progress.
 * Every stage of that lifecycle — choosing a mode, watching progress, seeing
 * the result, seeing an error — renders INSIDE one button-shaped control
 * (`renderControls`), not spread across a segmented control plus a separate
 * toast. That is deliberate: it is one context (this render), so it gets one
 * home, and a second, independent surface for the same information was
 * already tried once and rejected as two indicators for one thing.
 *
 * The phase select talks to `/project-state` (`createProjectStateHandler`):
 * it shows/updates the project's `project.json` phase, and launching a FULL
 * render asks whether to mark the project complete when the render finishes.
 * When the endpoint isn't wired (older hosts), the select simply hides.
 * Dependency-free by design (only `react` + `fetch`) so it can be dropped
 * into any brand's `.editor/main.tsx` host unchanged.
 *
 * The phase chip and the render control live in different header zones (see
 * `EditorShell`'s `phaseControl` / `renderControls` props), but both depend
 * on state (`/project-state`, `/render` polling) that only makes sense
 * fetched once. Rather than lifting that state to the caller, this component
 * keeps owning it and hands the two pieces out through a render-prop
 * `children` function — the caller decides WHERE each piece goes, this
 * component decides what's IN them. */

type RenderMode = 'preview' | 'full';

interface RenderJobResponse {
  running: boolean;
  mode?: RenderMode;
  percent: number;
  done: boolean;
  outPath?: string;
  error?: string;
}

interface ProjectStateResponse {
  exists: boolean;
  phase: string | null;
  name?: string;
  phases?: string[];
}

const POLL_INTERVAL_MS = 1000;

type Phase = 'idle' | 'starting' | 'rendering' | 'done' | 'error';

interface RenderButtonParts {
  /** The project-phase chip, or `null` when `/project-state` isn't wired. */
  phaseControl: ReactNode;
  /** The single "Render" control — every lifecycle stage (menu, progress,
   *  done, error) renders inside this one node, which is always present. */
  renderControls: ReactNode;
}

/** Same visual shell for every stage: a bordered, rounded, raised-neutral
 *  box (never accent — that's Save's and selection's) — only its CONTENTS
 *  change per phase. Not `overflow-hidden`: the idle stage's dropdown menu
 *  has to escape the box's own bounds to render below it. */
const RENDER_WRAP_CLASS =
  'ed:relative ed:inline-flex ed:items-stretch ed:rounded-md ed:border ed:border-line-strong ed:bg-control';

const RENDER_BTN_CLASS =
  'ed:relative ed:inline-flex ed:items-center ed:justify-center ed:gap-1.5 ed:px-4 ed:py-[7px] ed:text-[13px] ed:font-medium ed:text-ink ed:bg-transparent ed:border-0 ed:cursor-pointer ed:hover:not-disabled:bg-line ed:disabled:opacity-60 ed:disabled:cursor-default ed:tabular-nums ed:whitespace-nowrap';

const MENU_ITEM_CLASS =
  'ed:block ed:w-full ed:text-left ed:px-3 ed:py-2 ed:text-[13px] ed:text-ink ed:bg-transparent ed:border-0 ed:cursor-pointer ed:hover:bg-line';

/** Determinate ring, `stroke-dasharray`/`stroke-dashoffset` on a circle — no
 *  charting library, just SVG. `aria-hidden`: the percentage it draws is
 *  also in the button's own accessible name (`aria-label`), so a screen
 *  reader gets the number, not a shape it can't see the fill of anyway. */
function ProgressRing({ percent }: { percent: number }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="ed:shrink-0">
      <circle cx="7" cy="7" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}

export function RenderButton({ children }: { children: (parts: RenderButtonParts) => ReactNode }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<RenderMode | undefined>(undefined);
  const [percent, setPercent] = useState(0);
  const [outPath, setOutPath] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);

  // Project lifecycle (null until /project-state responds; hides when absent).
  const [projectPhase, setProjectPhase] = useState<string | null>(null);
  const [projectPhases, setProjectPhases] = useState<string[] | null>(null);
  // Set at FULL-render launch (the confirm); consumed when that render finishes.
  const markCompleteRef = useRef(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const menuRef = useRef<HTMLDivElement>(null);

  const stopPolling = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(
    () => () => {
      mountedRef.current = false;
      stopPolling();
    },
    [],
  );

  // The dropdown only makes sense in 'idle' — close it the instant a render
  // starts (or is already found running by a poll from elsewhere).
  useEffect(() => {
    if (phase !== 'idle') setMenuOpen(false);
  }, [phase]);

  // Outside click closes the menu — the standard dropdown contract; without
  // it the menu can only ever be closed by picking an option.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [menuOpen]);

  // Discover the project lifecycle endpoint. Hosts without it (or projects
  // whose dev server predates it) just don't show the phase select.
  useEffect(() => {
    fetch('/project-state')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProjectStateResponse | null) => {
        if (!mountedRef.current || !data || !Array.isArray(data.phases)) return;
        setProjectPhases(data.phases);
        setProjectPhase(data.phase);
      })
      .catch(() => {});
  }, []);

  const updateProjectPhase = (next: string) => {
    const prev = projectPhase;
    setProjectPhase(next); // optimistic — reverted on failure
    fetch('/project-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: next }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to set phase (${res.status})`);
      })
      .catch(() => {
        if (mountedRef.current) setProjectPhase(prev);
      });
  };

  const poll = () => {
    fetch('/render')
      .then((res) => res.json())
      .then((data: RenderJobResponse) => {
        if (!mountedRef.current) return;
        if (data.error) {
          stopPolling();
          setPhase('error');
          setError(data.error);
          setMode(data.mode);
          return;
        }
        if (data.running) {
          setPhase('rendering');
          setMode(data.mode);
          setPercent(data.percent);
          return;
        }
        if (data.done) {
          stopPolling();
          setPhase('done');
          setMode(data.mode);
          setPercent(100);
          setOutPath(data.outPath);
          if (data.mode === 'full' && markCompleteRef.current) {
            markCompleteRef.current = false;
            updateProjectPhase('complete');
          }
          return;
        }
        // Not running, not done, no error: nothing in flight — back to idle.
        stopPolling();
        setPhase('idle');
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        stopPolling();
        setPhase('error');
        setError(err instanceof Error ? err.message : 'Failed to poll render status');
      });
  };

  const startPolling = () => {
    stopPolling();
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
  };

  const startRender = (clickedMode: RenderMode) => {
    setMenuOpen(false);
    // A full render is the "final export" moment — offer to close the project
    // out (only when the lifecycle endpoint is wired and it isn't closed yet).
    if (clickedMode === 'full' && projectPhases && projectPhase !== 'complete') {
      markCompleteRef.current = window.confirm('Mark the project as complete when this render finishes?');
    } else {
      markCompleteRef.current = false;
    }

    setError(undefined);
    setOutPath(undefined);
    setPercent(0);
    setMode(clickedMode);
    setPhase('starting');

    fetch('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: clickedMode }),
    })
      .then(async (res) => {
        if (!mountedRef.current) return;
        if (res.status === 409) {
          // A render is already in progress — just start polling for its real state.
          startPolling();
          return;
        }
        const data = await res.json().catch(() => ({}) as { error?: string });
        if (!res.ok) {
          setPhase('error');
          setError(data.error || `Failed to start render (${res.status})`);
          return;
        }
        startPolling();
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        setPhase('error');
        setError(err instanceof Error ? err.message : 'Failed to start render');
      });
  };

  const reveal = () => {
    fetch('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reveal' }),
    }).catch(() => {});
  };

  const dismiss = () => setPhase('idle');
  // Activating "Open" both reveals the file AND returns the control to idle
  // — a second render can be started right away, no separate dismiss needed
  // first (the standalone dismiss below exists for "never mind", not this).
  const openAndDismiss = () => {
    reveal();
    dismiss();
  };

  const phaseControl = projectPhases ? (
    <div className="ed:relative ed:inline-flex ed:items-center">
      <select
        value={projectPhase ?? ''}
        onChange={(e) => updateProjectPhase(e.target.value)}
        title="Project phase (written to project.json)"
        className="ed:appearance-none ed:bg-control ed:text-ink-2 ed:text-[12px] ed:font-medium ed:border ed:border-line ed:rounded-full ed:pl-3 ed:pr-6 ed:py-[3px] ed:cursor-pointer ed:hover:text-ink ed:hover:border-line-strong"
      >
        {projectPhase === null && <option value="">— phase —</option>}
        {projectPhases.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={11} className="ed:pointer-events-none ed:absolute ed:right-2 ed:text-ink-3" />
    </div>
  ) : null;

  let renderControls: ReactNode;
  if (phase === 'starting' || phase === 'rendering') {
    const modeLabel = mode ? ` ${mode}` : '';
    const label = `Rendering${modeLabel}… ${percent}%`;
    renderControls = (
      <div className={RENDER_WRAP_CLASS}>
        <button type="button" className={RENDER_BTN_CLASS} disabled aria-label={label} title={label}>
          <ProgressRing percent={percent} />
          Rendering …
        </button>
      </div>
    );
  } else if (phase === 'done') {
    const base = outPath ? (outPath.split(/[\\/]/).pop() ?? outPath) : undefined;
    renderControls = (
      <div className={RENDER_WRAP_CLASS}>
        <button
          type="button"
          className={RENDER_BTN_CLASS}
          onClick={openAndDismiss}
          title={outPath}
          aria-label={`Render complete. Open${base ? ` ${base}` : ''}`}
        >
          <CheckIcon size={14} />
          Render complete · Open
        </button>
        <span className="ed:w-px ed:bg-line-strong ed:self-stretch" />
        <button type="button" className={RENDER_BTN_CLASS} onClick={dismiss} title="Dismiss" aria-label="Dismiss">
          <XIcon size={13} />
        </button>
      </div>
    );
  } else if (phase === 'error') {
    renderControls = (
      <div className={RENDER_WRAP_CLASS}>
        <button
          type="button"
          className={RENDER_BTN_CLASS}
          onClick={dismiss}
          title={error ?? 'Render failed'}
          aria-label={`Render failed: ${error ?? 'unknown error'}. Click to dismiss and try again.`}
        >
          <TriangleAlertIcon size={14} />
          Render failed
        </button>
      </div>
    );
  } else {
    // idle — a menu button; opening it offers Preview and Full, each
    // starting that render immediately (one click from the open menu).
    renderControls = (
      <div className={RENDER_WRAP_CLASS} ref={menuRef}>
        <button
          type="button"
          className={RENDER_BTN_CLASS}
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          Render
          <ChevronDownIcon size={12} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="ed:absolute ed:top-full ed:left-0 ed:mt-1 ed:min-w-[180px] ed:bg-panel ed:border ed:border-line-strong ed:rounded-md ed:shadow-[0_6px_18px_rgba(0,0,0,0.5)] ed:z-20 ed:py-1"
          >
            <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => startRender('preview')} title="Render a half-scale preview MP4">
              Preview
            </button>
            <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => startRender('full')} title="Render the final full-scale MP4">
              Full
            </button>
          </div>
        )}
      </div>
    );
  }

  return <>{children({ phaseControl, renderControls })}</>;
}

export default RenderButton;
