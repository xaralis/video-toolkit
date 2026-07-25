import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEditorPlugin } from '@video-toolkit/lib/editor/host/editor-plugin.mts';

let root: string;

function fakeServer() {
  const routes = new Map<string, Function>();
  return { routes, server: { middlewares: { use: (r: string, h: Function) => routes.set(r, h) } } };
}

/**
 * Minimal ServerResponse stand-in capturing what a handler wrote. `done` resolves the
 * instant `end()` is called, so async route assertions can `await res.done` instead of
 * a fixed sleep — a fixed sleep races the handler's own async work (it reads the
 * request body, then awaits a write) and is flaky under load, not just standalone.
 */
function fakeRes() {
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end(b?: string) { this.body = b ?? ''; this.ended = true; resolveDone(); },
    ended: false,
    done,
  };
  return res;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-plugin-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/recordings'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/broll'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/Root.tsx'),
    `import { Composition } from 'remotion';
export const RemotionRoot = () => (
  <Composition id="MyReel" component={C} defaultProps={{ reel: { version: 'layered-1' } }} />
);
`,
  );
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const plug = (over: Record<string, unknown> = {}) =>
  createEditorPlugin({ templateRoot: root, compositionId: 'MyReel', ...over });

describe('createEditorPlugin', () => {
  it('is a named vite plugin', () => {
    expect(plug().name).toBe('video-toolkit-editor');
  });

  it('registers every editor route', () => {
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    expect([...routes.keys()].sort()).toEqual(['/project-state', '/props', '/render', '/save', '/sources'].sort());
  });

  it('GET /props returns the defaultProps of the configured composition', async () => {
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    const res = fakeRes();
    routes.get('/props')!({ method: 'GET' }, res);
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ reel: { version: 'layered-1' } });
  });

  it('rejects a non-GET on /props with 405', () => {
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    const res = fakeRes();
    routes.get('/props')!({ method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
  });

  it('lists only video files from recordings and broll, sorted', () => {
    fs.writeFileSync(path.join(root, 'public/recordings/b.mp4'), '');
    fs.writeFileSync(path.join(root, 'public/recordings/a.MOV'), '');
    fs.writeFileSync(path.join(root, 'public/recordings/notes.txt'), '');
    fs.writeFileSync(path.join(root, 'public/broll/c.webm'), '');
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    const res = fakeRes();
    routes.get('/sources')!({ method: 'GET' }, res);
    expect(JSON.parse(res.body)).toEqual({ recordings: ['a.MOV', 'b.mp4'], broll: ['c.webm'] });
  });

  it('returns empty lists when the footage directories do not exist', () => {
    fs.rmSync(path.join(root, 'public/recordings'), { recursive: true });
    fs.rmSync(path.join(root, 'public/broll'), { recursive: true });
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    const res = fakeRes();
    routes.get('/sources')!({ method: 'GET' }, res);
    // Footage dirs are optional until a project actually has footage — a missing
    // one is not an error, it is an empty project.
    expect(JSON.parse(res.body)).toEqual({ recordings: [], broll: [] });
  });

  it('reports a read failure as 500 rather than crashing the dev server', () => {
    fs.rmSync(path.join(root, 'src/Root.tsx'));
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    const res = fakeRes();
    routes.get('/props')!({ method: 'GET' }, res);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/Failed to read/);
  });

  it('POST /save ignores a client-supplied rootPath — the write always targets this project\'s own Root.tsx', async () => {
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    const res = fakeRes();
    const req: any = {
      method: 'POST',
      on(event: string, cb: (arg?: any) => void) {
        if (event === 'data') {
          cb(JSON.stringify({ rootPath: '/etc/somewhere-else/Root.tsx', props: { reel: { version: 'layered-2' } } }));
        }
        if (event === 'end') {
          cb();
        }
        return req;
      },
    };
    routes.get('/save')!(req, res);
    // The save handler is async internally (reads the request body, then awaits the
    // write); await the response's own completion signal rather than a fixed sleep —
    // a fixed sleep races the handler and is flaky under load (observed ~1/3 runs
    // under the full suite), not just standalone.
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync('/etc/somewhere-else/Root.tsx')).toBe(false);
    const written = fs.readFileSync(path.join(root, 'src/Root.tsx'), 'utf-8');
    expect(written).toMatch(/version:\s*["']layered-2["']/);
  });
});
