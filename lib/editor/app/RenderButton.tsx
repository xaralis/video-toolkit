import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * "Render preview / full" control for the editor's timeline toolbar.
 *
 * Talks to the dev-server's `/render` endpoint (`createRenderHandler`, see
 * `lib/editor/src/render-endpoint.ts`): POSTs `{ mode }` to kick off a real
 * Remotion render, then polls GET `/render` once a second for progress.
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

const POLL_INTERVAL_MS = 1000;
const DONE_DISPLAY_MS = 4000;

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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const stopPolling = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const clearDoneTimeout = () => {
    if (doneTimeoutRef.current !== null) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }
  };

  useEffect(
    () => () => {
      mountedRef.current = false;
      stopPolling();
      clearDoneTimeout();
    },
    [],
  );

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
          clearDoneTimeout();
          doneTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) setPhase('idle');
          }, DONE_DISPLAY_MS);
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
    clearDoneTimeout();
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

  if (phase === 'rendering') {
    return (
      <div style={pillStyle}>
        Rendering {mode ?? '…'}… {percent}%
      </div>
    );
  }

  if (phase === 'done') {
    return <div style={pillStyle}>✓ {outPath}</div>;
  }

  // idle / starting / error: buttons stay visible (disabled while the POST that
  // kicks off a render is in flight) so the user always has something to click.
  const disabled = phase === 'starting';
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
    </div>
  );
}

export default RenderButton;
