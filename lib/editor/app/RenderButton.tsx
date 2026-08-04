import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, ChevronDownIcon, TriangleAlertIcon, XIcon } from './icons';

/**
 * "Render preview / full" control for the editor's header toolbar, plus the
 * project lifecycle control.
 *
 * Talks to the dev-server's `/render` endpoint (`createRenderHandler`, see
 * `lib/editor/src/render-endpoint.ts`): POSTs `{ mode }` to kick off a real
 * Remotion render, then polls GET `/render` once a second for progress. A
 * finished render is reported via `renderStatus` (a small toast the caller
 * places over the editor area) until dismissed — the Preview/Full control
 * itself is never replaced by it, so a second render can be started right
 * away.
 *
 * The phase select talks to `/project-state` (`createProjectStateHandler`):
 * it shows/updates the project's `project.json` phase, and launching a FULL
 * render asks whether to mark the project complete when the render finishes.
 * When the endpoint isn't wired (older hosts), the select simply hides.
 * Dependency-free by design (only `react` + `fetch`) so it can be dropped
 * into any brand's `.editor/main.tsx` host unchanged.
 *
 * The phase chip and the render controls/status live in different header
 * zones (see `EditorShell`'s `phaseControl` / `renderControls` /
 * `renderStatus` props), but both depend on state (`/project-state`,
 * `/render` polling) that only makes sense fetched once. Rather than lifting
 * that state to the caller, this component keeps owning it and hands the
 * three pieces out through a render-prop `children` function — the caller
 * decides WHERE each piece goes, this component decides what's IN them. */

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

/** One half of the Preview|Full segmented control. Filled/raised (`control` +
 *  `line-strong`), never the accent — the accent is reserved for Save and
 *  selection (see EditorShell), so a promoted-but-not-accent treatment is
 *  what keeps this reading as "the primary action" without competing with
 *  those two. */
const segmentBtnClass =
  'ed:relative ed:inline-flex ed:items-center ed:justify-center ed:gap-1 ed:px-4 ed:py-[7px] ed:text-[13px] ed:font-medium ed:text-ink ed:bg-transparent ed:border-0 ed:cursor-pointer ed:hover:not-disabled:bg-line ed:disabled:opacity-50 ed:disabled:cursor-default ed:tabular-nums';

const toastClass =
  'ed:flex ed:items-center ed:gap-2 ed:bg-panel ed:border ed:rounded-md ed:shadow-[0_6px_18px_rgba(0,0,0,0.5)] ed:px-3 ed:py-2 ed:text-[13px] ed:text-ink ed:max-w-[420px]';

const toastBtnClass =
  'ed:inline-flex ed:items-center ed:gap-1 ed:bg-transparent ed:text-ink-2 ed:border ed:border-line-strong ed:rounded ed:px-2 ed:py-1 ed:text-[12px] ed:cursor-pointer ed:hover:text-ink ed:shrink-0';

type Phase = 'idle' | 'starting' | 'rendering' | 'done' | 'error';

interface RenderButtonParts {
  /** The project-phase chip, or `null` when `/project-state` isn't wired. */
  phaseControl: ReactNode;
  /** The Preview|Full segmented control — always present, never replaced;
   *  shows a determinate progress bar + percentage while rendering. */
  renderControls: ReactNode;
  /** A dismissible toast for a finished render or an error, or `null` while
   *  there's nothing to report. The caller overlays it on the editor area. */
  renderStatus: ReactNode;
}

export function RenderButton({ children }: { children: (parts: RenderButtonParts) => ReactNode }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<RenderMode | undefined>(undefined);
  const [percent, setPercent] = useState(0);
  const [outPath, setOutPath] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  // Project lifecycle (null until /project-state responds; hides when absent).
  const [projectPhase, setProjectPhase] = useState<string | null>(null);
  const [projectPhases, setProjectPhases] = useState<string[] | null>(null);
  // Set at FULL-render launch (the confirm); consumed when that render finishes.
  const markCompleteRef = useRef(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

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

  // The segmented control is never swapped out for a pill/status view — it
  // stays in place across every phase so a render can always be (re)started
  // without dismissing anything first. Only 'starting' and 'rendering'
  // disable it, matching what the control could always do: no way existed to
  // fire a second render while one was already in flight.
  const busy = phase === 'starting' || phase === 'rendering';
  const renderControls = (
    <div className="ed:relative ed:inline-flex ed:items-stretch ed:overflow-hidden ed:rounded-md ed:border ed:border-line-strong ed:bg-control">
      <button
        type="button"
        className={segmentBtnClass}
        disabled={busy}
        onClick={() => startRender('preview')}
        title="Render a half-scale preview MP4"
      >
        Preview{phase === 'rendering' && mode === 'preview' ? ` ${percent}%` : ''}
      </button>
      <span className="ed:w-px ed:bg-line-strong ed:self-stretch" />
      <button
        type="button"
        className={segmentBtnClass}
        disabled={busy}
        onClick={() => startRender('full')}
        title="Render the final full-scale MP4"
      >
        Full{phase === 'rendering' && mode === 'full' ? ` ${percent}%` : ''}
      </button>
      {phase === 'rendering' && (
        <div
          aria-hidden="true"
          className="ed:absolute ed:left-0 ed:bottom-0 ed:h-[3px] ed:bg-ink-2"
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );

  let renderStatus: ReactNode = null;
  if (phase === 'done') {
    const base = outPath ? (outPath.split(/[\\/]/).pop() ?? outPath) : undefined;
    renderStatus = (
      <div className={`${toastClass} ed:border-line-strong`} title={outPath}>
        <CheckIcon size={14} />
        <span className="ed:truncate">{base}</span>
        <button type="button" className={toastBtnClass} onClick={reveal} title="Show the rendered file in the OS file manager">
          Show in Finder
        </button>
        <button type="button" className={toastBtnClass} onClick={dismiss} title="Dismiss" aria-label="Dismiss">
          <XIcon size={13} />
        </button>
      </div>
    );
  } else if (phase === 'error' && error) {
    renderStatus = (
      <div className={`${toastClass} ed:border-danger ed:text-danger`} title={error}>
        <TriangleAlertIcon size={14} />
        <span className="ed:truncate">{error}</span>
        <button type="button" className={toastBtnClass} onClick={dismiss} title="Dismiss" aria-label="Dismiss">
          <XIcon size={13} />
        </button>
      </div>
    );
  }

  return <>{children({ phaseControl, renderControls, renderStatus })}</>;
}

export default RenderButton;
