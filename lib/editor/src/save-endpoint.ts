import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { updateDefaultPropsSurgically, verifyDefaultProps } from './default-props-writer';

export interface SaveDefaultPropsOpts {
  compositionId?: string;
  /**
   * Optional post-process applied to the surgically-updated source before the read-back verify
   * and atomic write. Intended for a caller-supplied formatter (e.g. the consuming project's own
   * Prettier config) so Save produces diffs that match the project's style — core stays
   * formatter-agnostic and never imports a formatter itself. If this throws, the target file is
   * left untouched (same guarantee as the existing verify-before-rename guard).
   */
  format?: (source: string, filePath: string) => string | Promise<string>;
}

export async function saveDefaultPropsToFile(
  filePath: string,
  props: unknown,
  opts: SaveDefaultPropsOpts = {},
): Promise<void> {
  const source = await readFile(filePath, 'utf8');
  // Surgical, diff-based rewrite: only the leaf values that actually changed are edited in the
  // AST, so a human author's comments and `as const` assertions on every untouched property
  // survive the Save. (A full-regeneration rewrite is still available as `rewriteDefaultProps`
  // for callers that want it, but the editor's Save must not destroy hand-authored structure.)
  let next = updateDefaultPropsSurgically(source, props, opts);
  // Optional caller-supplied formatting pass (e.g. project Prettier), applied BEFORE the
  // verify-before-rename guard below so a throwing/misbehaving formatter fails safely without
  // touching the target file.
  if (opts.format) {
    next = await opts.format(next, filePath);
  }
  // Verify the rewritten source reads back as EXACTLY the props we were asked to save, BEFORE
  // touching the target file. Root.tsx is the single source of truth for Studio and
  // /toolkit:render; if the rewrite (or the formatter) ever produced malformed or lossy output we
  // must fail here rather than clobber the user's working file. A parse-only check is not enough —
  // TypeScript's parser recovers from unbalanced brackets and returns a value, which is precisely
  // how a raw-character-range surgery bug would slip through. See `verifyDefaultProps`.
  verifyDefaultProps(next, props, opts);
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
  resolve: (body: SaveRequest) => {
    filePath: string;
    compositionId?: string;
    /** Forwarded to `saveDefaultPropsToFile`'s `opts.format` — see `SaveDefaultPropsOpts.format`. */
    format?: SaveDefaultPropsOpts['format'];
  },
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
    const { filePath, compositionId, format } = resolve(req);
    await saveDefaultPropsToFile(filePath, req.props, { compositionId, format });
    return { ok: true };
  };
}
