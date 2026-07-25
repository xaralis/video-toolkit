import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createProjectStateHandler, PROJECT_PHASES } from './project-state-endpoint';
import type { MinimalReq, MinimalRes } from './project-state-endpoint';

// --- tiny req/res doubles (same pattern as render-endpoint.test.ts) ---------

function makeReq(method: string, body?: string): MinimalReq {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = { data: [], end: [] };
  const req: MinimalReq = {
    method,
    on(event: 'data' | 'end', listener: (...args: never[]) => void) {
      listeners[event].push(listener as (...args: unknown[]) => void);
      return req;
    },
  };
  // Fire asynchronously like a real socket.
  setTimeout(() => {
    if (body !== undefined) for (const l of listeners.data) l(body);
    for (const l of listeners.end) l();
  }, 0);
  return req;
}

function makeRes(): MinimalRes & { body?: string; finished: Promise<void> } {
  let resolve!: () => void;
  const finished = new Promise<void>((r) => (resolve = r));
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as string | undefined,
    finished,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    end(chunk?: string) {
      res.body = chunk;
      resolve();
    },
  };
  return res;
}

const parse = (res: { body?: string }) => JSON.parse(res.body ?? 'null');

// --- tests -------------------------------------------------------------------

let dir: string;
let projectJsonPath: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-state-'));
  projectJsonPath = path.join(dir, 'project.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('createProjectStateHandler GET', () => {
  it('reports a missing project.json as exists:false', async () => {
    const handler = createProjectStateHandler({ projectJsonPath });
    const res = makeRes();
    handler(makeReq('GET'), res);
    await res.finished;
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toMatchObject({ exists: false, phase: null });
    expect(parse(res).phases).toEqual([...PROJECT_PHASES]);
  });

  it('reports the current phase and name', async () => {
    fs.writeFileSync(projectJsonPath, JSON.stringify({ name: 'my-reel', phase: 'editing' }));
    const handler = createProjectStateHandler({ projectJsonPath });
    const res = makeRes();
    handler(makeReq('GET'), res);
    await res.finished;
    expect(parse(res)).toMatchObject({ exists: true, phase: 'editing', name: 'my-reel' });
  });

  it('treats an unknown phase value as null', async () => {
    fs.writeFileSync(projectJsonPath, JSON.stringify({ phase: 'weird' }));
    const handler = createProjectStateHandler({ projectJsonPath });
    const res = makeRes();
    handler(makeReq('GET'), res);
    await res.finished;
    expect(parse(res).phase).toBeNull();
  });
});

describe('createProjectStateHandler POST', () => {
  it('updates the phase and stamps updated, preserving other fields', async () => {
    fs.writeFileSync(projectJsonPath, JSON.stringify({ name: 'my-reel', phase: 'editing', topic: 'T' }));
    const handler = createProjectStateHandler({ projectJsonPath });
    const res = makeRes();
    handler(makeReq('POST', JSON.stringify({ phase: 'complete' })), res);
    await res.finished;
    expect(res.statusCode).toBe(200);
    const written = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
    expect(written).toMatchObject({ name: 'my-reel', phase: 'complete', topic: 'T' });
    expect(written.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('creates a minimal project.json when absent', async () => {
    const handler = createProjectStateHandler({ projectJsonPath });
    const res = makeRes();
    handler(makeReq('POST', JSON.stringify({ phase: 'complete' })), res);
    await res.finished;
    expect(res.statusCode).toBe(200);
    const written = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
    expect(written.phase).toBe('complete');
    expect(written.name).toBe(path.basename(dir));
  });

  it('rejects an unknown phase', async () => {
    const handler = createProjectStateHandler({ projectJsonPath });
    const res = makeRes();
    handler(makeReq('POST', JSON.stringify({ phase: 'nope' })), res);
    await res.finished;
    expect(res.statusCode).toBe(400);
    expect(fs.existsSync(projectJsonPath)).toBe(false);
  });

  it('rejects malformed JSON', async () => {
    const handler = createProjectStateHandler({ projectJsonPath });
    const res = makeRes();
    handler(makeReq('POST', '{oops'), res);
    await res.finished;
    expect(res.statusCode).toBe(400);
  });
});

it('rejects other methods with 405', async () => {
  const handler = createProjectStateHandler({ projectJsonPath });
  const res = makeRes();
  handler(makeReq('DELETE'), res);
  await res.finished;
  expect(res.statusCode).toBe(405);
});
