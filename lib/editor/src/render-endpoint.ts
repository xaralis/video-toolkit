import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Render preview/full endpoint backing the editor's "Render" toolbar button.
 *
 * A single handler instance holds one render job in closure state — this
 * toolkit targets a single local dev server per project, so one job at a
 * time is the right model (a second render while one is running is rejected
 * with 409, not queued).
 */

export type RenderMode = 'preview' | 'full';

/**
 * Where a render writes: `out/<project>-<mode>.mp4`.
 *
 * The name comes from the PROJECT, not the composition. Every project built
 * from the same template shares a composition id, so the old
 * `out/<compositionId>.mp4` produced the identical filename for all of them —
 * indistinguishable the moment two land in one folder, which for a reviewer
 * means one downloads folder. The mode is always spelled out, `-full`
 * included: under the old scheme only previews were labelled, so the file that
 * mattered was the one with no label on it.
 *
 * `project.json`'s `name` wins; without it (or with it malformed, unnamed, or
 * carrying a path separator) the project directory's own name is used. That
 * fallback is also the guard: a name is a filename component here and is never
 * allowed to reach outside `out/`.
 */
export function renderOutPath(projectRoot: string, mode: RenderMode): string {
  const dirName = path.basename(projectRoot);
  let name: string | undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(projectRoot, 'project.json'), 'utf-8')) as {
      name?: unknown;
    };
    if (typeof parsed.name === 'string' && parsed.name.trim()) name = parsed.name.trim();
  } catch {
    // missing or malformed project.json — the directory name is the fallback
  }
  // A name must be a single path component. Anything else falls back rather
  // than being sanitised: a silently rewritten filename is harder to explain
  // than one that is simply the folder's name.
  if (!name || name !== path.basename(name)) name = dirName;
  return `out/${name}-${mode}.mp4`;
}

export interface RenderJobState {
  running: boolean;
  mode?: RenderMode;
  percent: number;
  done: boolean;
  /** SIGTERM sent, process not gone yet — still `running`, but no longer on its way to `done`. */
  cancelling: boolean;
  /** The last render was stopped by the user. Distinct from both `done` and `error`. */
  cancelled: boolean;
  outPath?: string;
  error?: string;
  startedAt?: number;
}

/** How long a cancelled render gets to shut down cleanly before SIGKILL. */
const KILL_GRACE_MS = 5000;

export interface CreateRenderHandlerOpts {
  /** Absolute path to the project root the render is run from (`cwd` for the spawned process). Config-time, never client-supplied. */
  projectRoot: string;
  /** Remotion composition id to render. Config-time, never client-supplied. */
  compositionId: string;
  /** Extra CLI args appended to the render command (e.g. `['--gl=angle']`). Config-time, never client-supplied. */
  extraArgs?: string[];
}

/** Opens the OS file manager with `absPath` selected (Finder/Explorer; a
 * directory open on Linux). Fire-and-forget — reveal failures are non-fatal. */
function revealInFileManager(absPath: string): void {
  if (process.platform === 'darwin') {
    spawn('open', ['-R', absPath]).on('error', () => {});
  } else if (process.platform === 'win32') {
    spawn('explorer', [`/select,${absPath}`]).on('error', () => {});
  } else {
    spawn('xdg-open', [path.dirname(absPath)]).on('error', () => {});
  }
}

/**
 * Signals a whole render tree.
 *
 * `npx remotion render` is three processes deep — the npx wrapper, the
 * remotion CLI, and the chrome-headless-shell compositor it spawns — and a
 * SIGTERM to the wrapper alone routinely leaves the browser behind. Orphaned
 * `chrome-headless-shell` processes are a known way to wedge the next render
 * in this repo, so the child is spawned `detached` (it leads its own process
 * group) and cancel signals `-pid`, which reaches every descendant.
 *
 * Falls back to signalling the child alone when the group is already gone
 * (ESRCH) or the platform has no process groups (Windows).
 */
function signalRenderTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid !== undefined && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall through to the single-process kill below.
    }
  }
  try {
    child.kill(signal);
  } catch {
    // The process is already gone — nothing to signal, nothing to report.
  }
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
 *
 * Two actions ride on the same POST: `{ action: 'reveal' }` opens the last
 * output in the OS file manager, and `{ action: 'cancel' }` stops a running
 * render (SIGTERM to its process group, SIGKILL after {@link KILL_GRACE_MS}).
 * Both answer 404 when there is nothing to act on.
 */
export function createRenderHandler(
  opts: CreateRenderHandlerOpts,
): (req: MinimalReq, res: MinimalRes) => void {
  const { projectRoot, compositionId, extraArgs = [] } = opts;

  /**
   * The serialized state plus the handles cancel needs.
   *
   * The child MUST live on `job` and not in a `startRender` local: `job` is
   * reassigned wholesale (`job = { ...job, … }`) on every progress tick, and a
   * handle that isn't spread along is lost the moment the first line of
   * Remotion output arrives — which is exactly why a render used to be
   * unstoppable once started.
   */
  interface RenderJob extends RenderJobState {
    child?: ChildProcess;
    /** Pending SIGKILL escalation, cleared if the process exits in time. */
    killTimer?: ReturnType<typeof setTimeout>;
    /** Dev-server `exit` hook — a detached child would otherwise outlive it. */
    onProcessExit?: () => void;
  }

  let job: RenderJob = {
    running: false,
    percent: 0,
    done: false,
    cancelling: false,
    cancelled: false,
  };

  /** The public view of the job — what GET and cancel both answer with. */
  function publicState(): RenderJobState {
    return {
      running: job.running,
      mode: job.mode,
      percent: job.percent,
      done: job.done,
      cancelling: job.cancelling,
      cancelled: job.cancelled,
      outPath: job.outPath,
      error: job.error,
    };
  }

  /** Drops every handle tied to the finished process (timer, exit hook, child). */
  function releaseChild(): Pick<RenderJob, 'child' | 'killTimer' | 'onProcessExit'> {
    if (job.killTimer) clearTimeout(job.killTimer);
    if (job.onProcessExit) process.removeListener('exit', job.onProcessExit);
    return { child: undefined, killTimer: undefined, onProcessExit: undefined };
  }

  /** SIGTERM now, SIGKILL after a grace period. Returns false if there's nothing to cancel. */
  function cancelRender(): boolean {
    const child = job.child;
    if (!job.running || !child) return false;
    if (job.cancelling) return true; // already signalled; let the escalation run

    signalRenderTree(child, 'SIGTERM');
    const killTimer = setTimeout(() => {
      if (job.child) signalRenderTree(job.child, 'SIGKILL');
    }, KILL_GRACE_MS);
    killTimer.unref?.();
    job = { ...job, cancelling: true, killTimer };
    return true;
  }

  function startRender(mode: RenderMode): void {
    const outPath = renderOutPath(projectRoot, mode);
    const args = ['remotion', 'render', compositionId, outPath];
    if (mode === 'preview') {
      args.push('--scale=0.5');
    }
    args.push(...extraArgs);

    job = {
      ...releaseChild(),
      running: true,
      mode,
      percent: 0,
      done: false,
      cancelling: false,
      cancelled: false,
      error: undefined,
      outPath,
      startedAt: Date.now(),
    };

    try {
      // `detached` gives the render its own process group — see signalRenderTree.
      const child = spawn('npx', args, { cwd: projectRoot, detached: true });

      // A detached child is NOT killed when the dev server's own group is
      // signalled (Ctrl-C in the terminal), so take responsibility for it
      // explicitly rather than trading one orphan source for another.
      const onProcessExit = () => signalRenderTree(child, 'SIGKILL');
      process.on('exit', onProcessExit);
      job = { ...job, child, onProcessExit };

      const onChunk = (chunk: Buffer | string) => {
        const progress = lastProgressMatch(chunk.toString());
        if (progress && progress.total > 0) {
          job = { ...job, percent: Math.round((100 * progress.rendered) / progress.total) };
        }
      };
      child.stdout?.on('data', onChunk);
      child.stderr?.on('data', onChunk);

      child.on('close', (code: number | null) => {
        // A cancelled render exits non-zero (or with a null code, killed by a
        // signal) — reporting that as "Render failed" would blame the user's
        // own Cancel on the renderer, so the cancel flag wins over the code.
        if (job.cancelling) {
          job = { ...job, ...releaseChild(), running: false, cancelling: false, cancelled: true, done: false };
        } else if (code === 0) {
          job = { ...job, ...releaseChild(), running: false, done: true, percent: 100 };
        } else {
          job = { ...job, ...releaseChild(), running: false, error: `Render failed (exit ${code})` };
        }
      });

      // Spawn-level failures (e.g. ENOENT) arrive as an 'error' event, not a throw —
      // never let one crash the dev server.
      child.on('error', (err: unknown) => {
        job = {
          ...job,
          ...releaseChild(),
          running: false,
          cancelling: false,
          error: err instanceof Error ? err.message : String(err),
        };
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
      res.end(JSON.stringify(publicState()));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        let parsed: { action?: unknown; mode?: unknown } = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch {
          // Malformed JSON body — treat as an empty body (the 'full' default below).
          parsed = {};
        }

        // `{ action: 'reveal' }` opens the last render's output in the OS file
        // manager. The revealed path is always projectRoot + the handler's own
        // outPath — never client-supplied. Allowed even while a render runs
        // (it doesn't touch the job).
        // `{ action: 'cancel' }` stops a running render. 404 (like reveal's
        // "nothing to do") when there is nothing in flight; 200 with the job
        // state once the signal is out. The job stays `running` until the
        // process actually exits — that's what keeps a new render from
        // starting on top of one that is still shutting down.
        if (parsed && parsed.action === 'cancel') {
          if (!cancelRender()) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'No render in progress to cancel' }));
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(publicState()));
          return;
        }

        if (parsed && parsed.action === 'reveal') {
          // A cancelled render leaves a truncated out/*.mp4 behind. Handing
          // it to Finder would present a partial file as the finished render.
          if (job.cancelled) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'The last render was cancelled — its output is incomplete' }));
            return;
          }
          const abs = job.outPath ? path.resolve(projectRoot, job.outPath) : undefined;
          if (!abs || !fs.existsSync(abs)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'No render output to reveal' }));
            return;
          }
          revealInFileManager(abs);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ revealed: true, outPath: job.outPath }));
          return;
        }

        if (job.running) {
          res.statusCode = 409;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'A render is already in progress' }));
          return;
        }

        let mode: RenderMode = 'full';
        if (parsed && (parsed.mode === 'preview' || parsed.mode === 'full')) {
          mode = parsed.mode;
        } else if (parsed && parsed.mode !== undefined) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: "mode must be 'preview' or 'full'" }));
          return;
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
