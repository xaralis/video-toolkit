import { spawn } from 'child_process';

/**
 * Render preview/full endpoint backing the editor's "Render" toolbar button.
 *
 * A single handler instance holds one render job in closure state — this
 * toolkit targets a single local dev server per project, so one job at a
 * time is the right model (a second render while one is running is rejected
 * with 409, not queued).
 */

export type RenderMode = 'preview' | 'full';

export interface RenderJobState {
  running: boolean;
  mode?: RenderMode;
  percent: number;
  done: boolean;
  outPath?: string;
  error?: string;
  startedAt?: number;
}

export interface CreateRenderHandlerOpts {
  /** Absolute path to the project root the render is run from (`cwd` for the spawned process). Config-time, never client-supplied. */
  projectRoot: string;
  /** Remotion composition id to render. Config-time, never client-supplied. */
  compositionId: string;
  /** Extra CLI args appended to the render command (e.g. `['--gl=angle']`). Config-time, never client-supplied. */
  extraArgs?: string[];
}

/** Matches Remotion's progress line, e.g. "Rendered 45/90". Only the last match in a chunk is used. */
const PROGRESS_RE = /Rendered (\d+)\/(\d+)/g;

function lastProgressMatch(text: string): { rendered: number; total: number } | undefined {
  let match: RegExpExecArray | null;
  let last: RegExpExecArray | undefined;
  PROGRESS_RE.lastIndex = 0;
  while ((match = PROGRESS_RE.exec(text))) {
    last = match;
  }
  if (!last) return undefined;
  return { rendered: Number(last[1]), total: Number(last[2]) };
}

/** Minimal request/response shapes this handler needs — matches Vite/Connect's middleware signature without depending on their types. */
export interface MinimalReq {
  method?: string;
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
}

export interface MinimalRes {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(chunk?: string): unknown;
}

/**
 * Returns a Connect/Vite dev-server middleware handling `GET|POST /render`.
 *
 * `POST` (body `{ mode: 'preview' | 'full' }`) spawns `npx remotion render`
 * for this handler's config-time `projectRoot`/`compositionId` and returns
 * immediately (202) — it does not wait for the render to finish. `GET`
 * returns the current job's progress. Only `mode` comes from the request
 * body; everything that determines *what* gets rendered and *where* it's
 * written is fixed at construction time, so a client can't redirect a render
 * to an arbitrary composition or output path.
 */
export function createRenderHandler(
  opts: CreateRenderHandlerOpts,
): (req: MinimalReq, res: MinimalRes) => void {
  const { projectRoot, compositionId, extraArgs = [] } = opts;

  let job: RenderJobState = {
    running: false,
    percent: 0,
    done: false,
  };

  function startRender(mode: RenderMode): void {
    const outPath = `out/${compositionId}${mode === 'preview' ? '-preview' : ''}.mp4`;
    const args = ['remotion', 'render', compositionId, outPath];
    if (mode === 'preview') {
      args.push('--scale=0.5');
    }
    args.push(...extraArgs);

    job = {
      running: true,
      mode,
      percent: 0,
      done: false,
      error: undefined,
      outPath,
      startedAt: Date.now(),
    };

    try {
      const child = spawn('npx', args, { cwd: projectRoot });

      const onChunk = (chunk: Buffer | string) => {
        const progress = lastProgressMatch(chunk.toString());
        if (progress && progress.total > 0) {
          job = { ...job, percent: Math.round((100 * progress.rendered) / progress.total) };
        }
      };
      child.stdout?.on('data', onChunk);
      child.stderr?.on('data', onChunk);

      child.on('close', (code: number | null) => {
        if (code === 0) {
          job = { ...job, running: false, done: true, percent: 100 };
        } else {
          job = { ...job, running: false, error: `Render failed (exit ${code})` };
        }
      });

      // Spawn-level failures (e.g. ENOENT) arrive as an 'error' event, not a throw —
      // never let one crash the dev server.
      child.on('error', (err: unknown) => {
        job = { ...job, running: false, error: err instanceof Error ? err.message : String(err) };
      });
    } catch (err) {
      // Defensive: spawn() itself is not expected to throw synchronously, but guard anyway.
      job = { ...job, running: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return (req: MinimalReq, res: MinimalRes) => {
    if (req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          running: job.running,
          mode: job.mode,
          percent: job.percent,
          done: job.done,
          outPath: job.outPath,
          error: job.error,
        }),
      );
      return;
    }

    if (req.method === 'POST') {
      if (job.running) {
        res.statusCode = 409;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'A render is already in progress' }));
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        let mode: RenderMode = 'full';
        try {
          const parsed = body ? JSON.parse(body) : {};
          if (parsed && (parsed.mode === 'preview' || parsed.mode === 'full')) {
            mode = parsed.mode;
          } else if (parsed && parsed.mode !== undefined) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: "mode must be 'preview' or 'full'" }));
            return;
          }
        } catch {
          // Malformed JSON body — fall back to the 'full' default rather than fail the request.
        }

        startRender(mode);
        res.statusCode = 202;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ started: true, mode }));
      });
      return;
    }

    res.statusCode = 405;
    res.end();
  };
}
