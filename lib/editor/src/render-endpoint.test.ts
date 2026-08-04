import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'child_process';
import { createRenderHandler, type MinimalReq, type MinimalRes } from './render-endpoint';

vi.mock('child_process', () => {
  const spawnFn = vi.fn();
  return { spawn: spawnFn, default: { spawn: spawnFn } };
});

vi.mock('fs', () => {
  const existsSync = vi.fn(() => true);
  return { existsSync, default: { existsSync } };
});

import fs from 'fs';

const spawnMock = vi.mocked(spawn);
const existsMock = vi.mocked(fs.existsSync);

/** A fake ChildProcess: an EventEmitter (for close/error) with stdout/stderr
 *  sub-emitters, a pid (cancel signals the process GROUP, i.e. `-pid`) and a
 *  `kill` spy (the non-POSIX fallback path). */
const liveChildren: Array<EventEmitter> = [];

function makeFakeChild(pid = 4242) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = pid;
  child.kill = vi.fn(() => true);
  liveChildren.push(child);
  return child;
}

/**
 * A fake Connect `req`. Because the handler registers its `data` listener
 * before its `end` listener (matching real Node stream usage), firing both
 * synchronously once `end` is registered lets tests avoid dealing with
 * stream scheduling.
 */
function makeReq(method: string, bodyObj?: unknown): MinimalReq {
  const body = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const req = {
    method,
    on(event: string, listener: (...args: unknown[]) => void) {
      handlers[event] = handlers[event] || [];
      handlers[event].push(listener);
      if (event === 'end') {
        for (const h of handlers.data || []) h(Buffer.from(body));
        for (const h of handlers.end || []) h();
      }
      return req;
    },
  } as unknown as MinimalReq;
  return req;
}

function makeRes(): MinimalRes & { body: string; headers: Record<string, string> } {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(chunk?: string) {
      this.body = chunk ?? '';
    },
  };
}

beforeEach(() => {
  spawnMock.mockReset();
  existsMock.mockReset();
  existsMock.mockReturnValue(true);
});

// A running render holds a `process.on('exit')` hook (it has to — the child is
// detached, so nothing else would reap it). Tests that leave renders running
// would accumulate those hooks and trip Node's max-listeners warning, so every
// fake child is closed out at the end of its test, like a real one would be.
afterEach(() => {
  for (const child of liveChildren.splice(0)) child.emit('close', 0);
});

describe('createRenderHandler — POST', () => {
  it('spawns a preview render with --scale=0.5 and extraArgs, returns 202', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);

    const handler = createRenderHandler({
      projectRoot: '/proj',
      compositionId: 'LayeredRoostReel',
      extraArgs: ['--gl=angle'],
    });
    const res = makeRes();
    handler(makeReq('POST', { mode: 'preview' }), res);

    expect(spawnMock).toHaveBeenCalledWith(
      'npx',
      ['remotion', 'render', 'LayeredRoostReel', 'out/LayeredRoostReel-preview.mp4', '--scale=0.5', '--gl=angle'],
      // `detached` puts the render in its OWN process group so cancel can
      // signal the whole tree (npx → remotion → chrome-headless-shell).
      { cwd: '/proj', detached: true },
    );
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toEqual({ started: true, mode: 'preview' });
  });

  it('spawns a full render without --scale', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);

    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    const res = makeRes();
    handler(makeReq('POST', { mode: 'full' }), res);

    expect(spawnMock).toHaveBeenCalledWith(
      'npx',
      ['remotion', 'render', 'LayeredCampaignReel', 'out/LayeredCampaignReel.mp4'],
      { cwd: '/proj', detached: true },
    );
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toEqual({ started: true, mode: 'full' });
  });

  it('defaults to full when mode is omitted', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);

    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    const res = makeRes();
    handler(makeReq('POST', {}), res);

    expect(JSON.parse(res.body)).toEqual({ started: true, mode: 'full' });
  });

  it('rejects a second POST while a render is running with 409', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);

    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    handler(makeReq('POST', { mode: 'preview' }), makeRes());

    const res2 = makeRes();
    handler(makeReq('POST', { mode: 'full' }), res2);

    expect(res2.statusCode).toBe(409);
    expect(JSON.parse(res2.body)).toEqual({ error: 'A render is already in progress' });
    // Only the first POST should have spawned a process.
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('allows a new render after the previous one finished', () => {
    const fakeChild1 = makeFakeChild();
    spawnMock.mockReturnValueOnce(fakeChild1 as never);
    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    handler(makeReq('POST', { mode: 'preview' }), makeRes());
    fakeChild1.emit('close', 0);

    const fakeChild2 = makeFakeChild();
    spawnMock.mockReturnValueOnce(fakeChild2 as never);
    const res2 = makeRes();
    handler(makeReq('POST', { mode: 'full' }), res2);

    expect(res2.statusCode).toBe(202);
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('never crashes on a spawn error, and records it in job state', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);

    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    handler(makeReq('POST', { mode: 'full' }), makeRes());

    expect(() => fakeChild.emit('error', new Error('spawn npx ENOENT'))).not.toThrow();

    const getRes = makeRes();
    handler(makeReq('GET'), getRes);
    const state = JSON.parse(getRes.body);
    expect(state.running).toBe(false);
    expect(state.error).toBe('spawn npx ENOENT');
  });
});

describe('createRenderHandler — GET', () => {
  it('returns the current job state', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);

    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    handler(makeReq('POST', { mode: 'preview' }), makeRes());

    const res = makeRes();
    handler(makeReq('GET'), res);
    expect(res.statusCode).toBe(200);
    const state = JSON.parse(res.body);
    expect(state).toMatchObject({
      running: true,
      mode: 'preview',
      percent: 0,
      done: false,
      outPath: 'out/LayeredCampaignReel-preview.mp4',
    });
  });

  it('parses the LAST "Rendered n/total" match from stdout to set percent', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);

    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    handler(makeReq('POST', { mode: 'full' }), makeRes());

    fakeChild.stdout.emit('data', Buffer.from('Rendered 10/90\nRendered 45/90\n'));

    const res = makeRes();
    handler(makeReq('GET'), res);
    expect(JSON.parse(res.body).percent).toBe(50);
  });

  it('reports done + percent 100 when the process exits 0', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);

    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    handler(makeReq('POST', { mode: 'full' }), makeRes());
    fakeChild.emit('close', 0);

    const res = makeRes();
    handler(makeReq('GET'), res);
    const state = JSON.parse(res.body);
    expect(state).toMatchObject({ running: false, done: true, percent: 100 });
  });

  it('reports an error when the process exits non-zero', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);

    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    handler(makeReq('POST', { mode: 'full' }), makeRes());
    fakeChild.emit('close', 1);

    const res = makeRes();
    handler(makeReq('GET'), res);
    const state = JSON.parse(res.body);
    expect(state.running).toBe(false);
    expect(state.error).toBe('Render failed (exit 1)');
  });
});

describe('createRenderHandler — reveal', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
  });

  it('404s when nothing has been rendered yet', () => {
    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    const res = makeRes();
    handler(makeReq('POST', { action: 'reveal' }), res);
    expect(res.statusCode).toBe(404);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('reveals the finished render via the OS file manager (macOS: open -R)', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);
    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    handler(makeReq('POST', { mode: 'full' }), makeRes());
    fakeChild.emit('close', 0);

    const res = makeRes();
    handler(makeReq('POST', { action: 'reveal' }), res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ revealed: true, outPath: 'out/LayeredCampaignReel.mp4' });
    expect(spawnMock).toHaveBeenLastCalledWith('open', ['-R', '/proj/out/LayeredCampaignReel.mp4']);
  });

  it('404s when the output file no longer exists on disk', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);
    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    handler(makeReq('POST', { mode: 'full' }), makeRes());
    fakeChild.emit('close', 0);

    existsMock.mockReturnValue(false);
    const res = makeRes();
    handler(makeReq('POST', { action: 'reveal' }), res);
    expect(res.statusCode).toBe(404);
    expect(spawnMock).toHaveBeenCalledTimes(1); // only the render spawn
  });

  it('does not 409 while a render is running', () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as never);
    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    handler(makeReq('POST', { mode: 'full' }), makeRes());

    const res = makeRes();
    handler(makeReq('POST', { action: 'reveal' }), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('createRenderHandler — cancel', () => {
  // The render runs in its own process group, so cancel signals `-pid`
  // through `process.kill` — never the npx wrapper alone, which would leave
  // remotion's chrome-headless-shell children orphaned.
  const spyOnKill = () => vi.spyOn(process, 'kill').mockImplementation(() => true);
  let killSpy: ReturnType<typeof spyOnKill>;

  beforeEach(() => {
    killSpy = spyOnKill();
  });
  afterEach(() => {
    killSpy.mockRestore();
    vi.useRealTimers();
  });

  function startedHandler(child = makeFakeChild()) {
    spawnMock.mockReturnValue(child as never);
    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    handler(makeReq('POST', { mode: 'full' }), makeRes());
    return { handler, child };
  }

  function getState(handler: ReturnType<typeof createRenderHandler>) {
    const res = makeRes();
    handler(makeReq('GET'), res);
    return JSON.parse(res.body);
  }

  it('SIGTERMs the running render’s process group and answers 200', () => {
    const { handler } = startedHandler();

    const res = makeRes();
    handler(makeReq('POST', { action: 'cancel' }), res);

    expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGTERM');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ running: true, cancelling: true, cancelled: false });
  });

  it('still finds the child after a progress tick has replaced the job object', () => {
    const { handler, child } = startedHandler();
    // Progress reassigns `job` wholesale — the handle has to survive it.
    child.stdout.emit('data', Buffer.from('Rendered 45/90\n'));

    const res = makeRes();
    handler(makeReq('POST', { action: 'cancel' }), res);

    expect(res.statusCode).toBe(200);
    expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGTERM');
  });

  it('escalates to SIGKILL when the render ignores SIGTERM', () => {
    vi.useFakeTimers();
    const { handler } = startedHandler();
    handler(makeReq('POST', { action: 'cancel' }), makeRes());

    expect(killSpy).not.toHaveBeenCalledWith(-4242, 'SIGKILL');
    vi.advanceTimersByTime(6000);
    expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');
  });

  it('does not SIGKILL a render that exits within the grace period', () => {
    vi.useFakeTimers();
    const { handler, child } = startedHandler();
    handler(makeReq('POST', { action: 'cancel' }), makeRes());
    child.emit('close', null);

    vi.advanceTimersByTime(60_000);
    expect(killSpy).not.toHaveBeenCalledWith(-4242, 'SIGKILL');
  });

  it('falls back to signalling the child directly when the group is already gone', () => {
    const { handler, child } = startedHandler();
    killSpy.mockImplementation(() => {
      throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    });

    const res = makeRes();
    handler(makeReq('POST', { action: 'cancel' }), res);

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(res.statusCode).toBe(200);
  });

  it('404s when no render is in progress', () => {
    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    const res = makeRes();
    handler(makeReq('POST', { action: 'cancel' }), res);

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'No render in progress to cancel' });
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('404s a cancel for a render that already finished', () => {
    const { handler, child } = startedHandler();
    child.emit('close', 0);

    const res = makeRes();
    handler(makeReq('POST', { action: 'cancel' }), res);
    expect(res.statusCode).toBe(404);
  });

  it('reads as cancelled — not as an error — once the process is gone', () => {
    const { handler, child } = startedHandler();
    handler(makeReq('POST', { action: 'cancel' }), makeRes());
    // A SIGTERMed process reports a null exit code (or 143); neither is a failure here.
    child.emit('close', null);

    const state = getState(handler);
    expect(state).toMatchObject({ running: false, cancelled: true, done: false });
    expect(state.error).toBeUndefined();
  });

  it('refuses to reveal the partial file a cancelled render left behind', () => {
    const { handler, child } = startedHandler();
    handler(makeReq('POST', { action: 'cancel' }), makeRes());
    child.emit('close', null);

    existsMock.mockReturnValue(true); // the partial out/*.mp4 is on disk
    const res = makeRes();
    handler(makeReq('POST', { action: 'reveal' }), res);

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'The last render was cancelled — its output is incomplete' });
  });

  it('clears the cancelled state when the next render starts', () => {
    const { handler, child } = startedHandler();
    handler(makeReq('POST', { action: 'cancel' }), makeRes());
    child.emit('close', null);

    spawnMock.mockReturnValue(makeFakeChild(999) as never);
    const res = makeRes();
    handler(makeReq('POST', { mode: 'preview' }), res);

    expect(res.statusCode).toBe(202);
    expect(getState(handler)).toMatchObject({ running: true, cancelled: false, cancelling: false });
  });

  it('kills the render’s process group if the dev server itself exits', () => {
    const before = process.listeners('exit');
    const { child } = startedHandler();
    const added = process.listeners('exit').filter((l) => !before.includes(l));
    expect(added).toHaveLength(1);

    (added[0] as () => void)();
    expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');

    // …and the listener is released once the render is over, so a long dev
    // session doesn't accumulate one per render.
    child.emit('close', 0);
    expect(process.listeners('exit').filter((l) => !before.includes(l))).toHaveLength(0);
  });
});

describe('createRenderHandler — other methods', () => {
  it('returns 405 for unsupported methods', () => {
    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    const res = makeRes();
    handler(makeReq('DELETE'), res);
    expect(res.statusCode).toBe(405);
  });
});
