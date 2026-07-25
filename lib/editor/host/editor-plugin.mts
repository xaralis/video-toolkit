import fs from 'fs';
import path from 'path';
import type { Plugin, ViteDevServer } from 'vite';
import { readDefaultProps } from '../src/default-props-writer';
import { createSaveHandler } from '../src/save-endpoint';
import { createRenderHandler } from '../src/render-endpoint';
import { createProjectStateHandler } from '../src/project-state-endpoint';
import { formatWithProjectPrettier } from './prettier-format';

export interface EditorPluginOptions {
  /** Absolute path to the project root (the template directory), NOT derived from the request. */
  templateRoot: string;
  /** Remotion composition id the editor edits — a brand's own composition id, e.g. `LayeredCampaignReel`. */
  compositionId: string;
  /** Extra CLI args appended to the render command (e.g. `['--gl=angle']`). Config-time, never client-supplied. */
  extraArgs?: string[];
  /**
   * Formatter applied to Save's surgically-updated source before the read-back verify and
   * write. Defaults to `formatWithProjectPrettier` (resolves the project's own Prettier config
   * from the file path). Overridable so a brand without Prettier — or with a different
   * formatting pipeline — isn't stuck with this default.
   */
  format?: (source: string, filePath: string) => string | Promise<string>;
}

/** Video file extensions recognized as footage (case-insensitive). */
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);

/**
 * Lists video files (by extension) directly inside `dir`, sorted. Returns an
 * empty array if the directory doesn't exist — footage dirs are optional
 * until a project actually has recordings/broll in them.
 */
function listVideoFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase())).sort();
}

/**
 * Vite dev-server plugin backing the reel editor.
 *
 * `GET /props` reads this project's `src/Root.tsx` from disk and returns its
 * `defaultProps` literal (for the configured composition) as JSON. The
 * project root comes from the plugin's own config-time option, never from
 * the incoming request, so this route can't be tricked into reading an
 * arbitrary path.
 *
 * `POST /save` writes the browser's in-memory props back to `src/Root.tsx`
 * via the shared save spine (`createSaveHandler`). The target file path is
 * resolved from `templateRoot` (config-time, server-side) — the request body
 * only ever supplies `props`, so a client can never redirect the write to an
 * arbitrary path.
 */
// No explicit `: Plugin` return annotation: Vite/Rollup type `configureServer` (and every
// other hook) as `ObjectHook<T>`, a union of a plain function and `{ handler, order }` —
// calling a union where one arm isn't callable is a TS error at any call site typed
// through that interface (`plug().configureServer!(server)`, e.g. in this module's own
// test). `satisfies Plugin` below verifies structural compatibility with Vite's Plugin
// shape without widening the returned literal's type to it, so callers see the concrete
// object type instead — whose `configureServer` is exactly the function we wrote here,
// still perfectly usable wherever a real `Plugin` is expected (e.g. Vite's `plugins` array).
export function createEditorPlugin(options: EditorPluginOptions) {
  const { templateRoot, compositionId, extraArgs = [], format = formatWithProjectPrettier } = options;
  const rootTsxPath = path.resolve(templateRoot, 'src/Root.tsx');
  const recordingsDir = path.resolve(templateRoot, 'public/recordings');
  const brollDir = path.resolve(templateRoot, 'public/broll');
  const saveProps = createSaveHandler(() => ({
    filePath: rootTsxPath,
    compositionId,
    format,
  }));

  const renderProps = createRenderHandler({
    projectRoot: templateRoot,
    compositionId,
    extraArgs,
  });

  const projectState = createProjectStateHandler({
    projectJsonPath: path.resolve(templateRoot, 'project.json'),
  });

  return {
    name: 'video-toolkit-editor',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/sources', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          const recordings = listVideoFiles(recordingsDir);
          const broll = listVideoFiles(brollDir);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ recordings, broll }));
        } catch (err) {
          console.error('[video-toolkit-editor] Failed to list footage sources:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Failed to list footage sources' }));
        }
      });

      server.middlewares.use('/props', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          const source = fs.readFileSync(rootTsxPath, 'utf-8');
          const props = readDefaultProps(source, { compositionId });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(props));
        } catch (err) {
          console.error('[video-toolkit-editor] Failed to read composition props:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Failed to read composition props' }));
        }
      });

      server.middlewares.use('/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          (async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              // rootPath is ignored by the resolve() above — the file path
              // is fixed to this project's Root.tsx, never client-supplied.
              const result = await saveProps({ rootPath: 'ignored', props: parsed.props });
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (err) {
              console.error('[video-toolkit-editor] Failed to save composition props:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Failed to save composition props' }));
            }
          })();
        });
      });

      server.middlewares.use('/render', renderProps);
      server.middlewares.use('/project-state', projectState);
    },
  } satisfies Plugin;
}
