import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'child_process';
import { createRenderHandler, type MinimalReq, type MinimalRes } from './render-endpoint';

vi.mock('child_process', () => {
  const spawnFn = vi.fn();
  return { spawn: spawnFn, default: { spawn: spawnFn } };
});

const spawnMock = vi.mocked(spawn);

/** A fake ChildProcess: an EventEmitter (for close/error) with stdout/stderr sub-emitters. */
function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
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
      { cwd: '/proj' },
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
      { cwd: '/proj' },
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

describe('createRenderHandler — other methods', () => {
  it('returns 405 for unsupported methods', () => {
    const handler = createRenderHandler({ projectRoot: '/proj', compositionId: 'LayeredCampaignReel' });
    const res = makeRes();
    handler(makeReq('DELETE'), res);
    expect(res.statusCode).toBe(405);
  });
});
