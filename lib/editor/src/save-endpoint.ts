import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readDefaultProps, updateDefaultPropsSurgically } from './default-props-writer';

export async function saveDefaultPropsToFile(
  filePath: string,
  props: unknown,
  opts: { compositionId?: string } = {},
): Promise<void> {
  const source = await readFile(filePath, 'utf8');
  // Surgical, diff-based rewrite: only the leaf values that actually changed are edited in the
  // AST, so a human author's comments and `as const` assertions on every untouched property
  // survive the Save. (A full-regeneration rewrite is still available as `rewriteDefaultProps`
  // for callers that want it, but the editor's Save must not destroy hand-authored structure.)
  const next = updateDefaultPropsSurgically(source, props, opts);
  // Verify the rewritten source is re-readable BEFORE touching the target file. Root.tsx is the
  // single source of truth for Studio and /toolkit:render; if the rewrite ever produced malformed
  // output, we must fail here rather than clobber the user's working file.
  readDefaultProps(next, opts);
  // Atomic write: write a temp sibling, then rename over the target.
  const tmp = join(dirname(filePath), `.${randomUUID()}.Root.tsx.tmp`);
  try {
    await writeFile(tmp, next, 'utf8');
    await rename(tmp, filePath);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

export interface SaveRequest {
  rootPath: string;
  props: unknown;
  compositionId?: string;
}

export function createSaveHandler(
  resolve: (body: SaveRequest) => { filePath: string; compositionId?: string },
): (body: unknown) => Promise<{ ok: true }> {
  return async (body: unknown) => {
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as SaveRequest).rootPath !== 'string' ||
      !('props' in body)
    ) {
      throw new Error('save handler: body must be { rootPath: string, props: unknown }.');
    }
    const req = body as SaveRequest;
    const { filePath, compositionId } = resolve(req);
    await saveDefaultPropsToFile(filePath, req.props, { compositionId });
    return { ok: true };
  };
}
