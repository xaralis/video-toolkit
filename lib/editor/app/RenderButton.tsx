import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * "Render preview / full" control for the editor's header toolbar, plus the
 * project lifecycle control.
 *
 * Talks to the dev-server's `/render` endpoint (`createRenderHandler`, see
 * `lib/editor/src/render-endpoint.ts`): POSTs `{ mode }` to kick off a real
 * Remotion render, then polls GET `/render` once a second for progress. A
 * finished render stays visible with a "Show in Finder" action (POST
 * `{ action: 'reveal' }`) until dismissed.
 *
 * The phase select talks to `/project-state` (`createProjectStateHandler`):
 * it shows/updates the project's `project.json` phase, and launching a FULL
 * render asks whether to mark the project complete when the render finishes.
 * When the endpoint isn't wired (older hosts), the select simply hides.
 * Dependency-free by design (only `react` + `fetch`) so it can be dropped
 * into any brand's `.editor/main.tsx` host unchanged.
 */

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

const BTN_H = 28;
const BTN_FONT = 12;

const btnStyle: CSSProperties = {
  background: '#26282f',
  border: '1px solid #34363e',
  color: '#e8e8ea',
  borderRadius: 4,
  height: BTN_H,
  fontSize: BTN_FONT,
  padding: '0 12px',
  cursor: 'pointer',
};

const btnDisabledStyle: CSSProperties = {
  ...btnStyle,
  opacity: 0.5,
  cursor: 'default',
};

const pillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: '#26282f',
  border: '1px solid #34363e',
  color: '#e8e8ea',
  borderRadius: 4,
  height: BTN_H,
  fontSize: BTN_FONT,
  padding: '0 12px',
  whiteSpace: 'nowrap',
};

const selectStyle: CSSProperties = {
  ...btnStyle,
  padding: '0 6px',
  appearance: 'auto',
};

const errorTextStyle: CSSProperties = {
  fontSize: BTN_FONT,
  color: '#ff8a7a',
  whiteSpace: 'nowrap',
  maxWidth: 260,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

type Phase = 'idle' | 'starting' | 'rendering' | 'done' | 'error';

export function RenderButton() {
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

  const phaseSelect = projectPhases ? (
    <select
      value={projectPhase ?? ''}
      onChange={(e) => updateProjectPhase(e.target.value)}
      style={selectStyle}
      title="Project phase (written to project.json)"
    >
      {projectPhase === null && <option value="">— phase —</option>}
      {projectPhases.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  ) : null;

  let controls: ReactNode;
  if (phase === 'rendering') {
    controls = (
      <div style={pillStyle}>
        Rendering {mode ?? '…'}… {percent}%
      </div>
    );
  } else if (phase === 'done') {
    // The finished render stays visible (with the reveal action) until
    // dismissed or a new render starts.
    controls = (
      <>
        <div style={pillStyle}>✓ {outPath}</div>
        <button type="button" style={btnStyle} onClick={reveal} title="Show the rendered file in the OS file manager">
          Show in Finder
        </button>
        <button type="button" style={btnStyle} onClick={() => setPhase('idle')} title="Dismiss">
          ✕
        </button>
      </>
    );
  } else {
    // idle / starting / error: buttons stay visible (disabled while the POST
    // that kicks off a render is in flight) so the user always has something
    // to click.
    const disabled = phase === 'starting';
    controls = (
      <>
        {phase === 'error' && error && (
          <span style={errorTextStyle} title={error}>
            ⚠ {error}
          </span>
        )}
        <button
          type="button"
          style={disabled ? btnDisabledStyle : btnStyle}
          disabled={disabled}
          onClick={() => startRender('preview')}
          title="Render a half-scale preview MP4"
        >
          Preview
        </button>
        <button
          type="button"
          style={disabled ? btnDisabledStyle : btnStyle}
          disabled={disabled}
          onClick={() => startRender('full')}
          title="Render the final full-scale MP4"
        >
          Full
        </button>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {phaseSelect}
      {controls}
    </div>
  );
}

export default RenderButton;
