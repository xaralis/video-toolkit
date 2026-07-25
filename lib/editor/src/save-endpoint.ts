import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rewriteDefaultProps } from './default-props-writer';

export async function saveDefaultPropsToFile(
  filePath: string,
  props: unknown,
  opts: { compositionId?: string } = {},
): Promise<void> {
  const source = await readFile(filePath, 'utf8');
  const next = rewriteDefaultProps(source, props, opts);
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
