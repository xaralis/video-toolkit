import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveDefaultPropsToFile, createSaveHandler } from './save-endpoint';
import { readDefaultProps } from './default-props-writer';

const ROOT = `import { Composition } from 'remotion';
export const Root = () => (
  <Composition id="CampaignReel" component={C} defaultProps={{ topic: 'old', segments: [] }} fps={30} width={1} height={1} />
);
`;

function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'reel-editor-'));
  const file = join(dir, 'Root.tsx');
  writeFileSync(file, ROOT, 'utf8');
  return file;
}

describe('saveDefaultPropsToFile', () => {
  it('persists new props to disk and leaves valid, re-readable source', async () => {
    const file = tmpRoot();
    const next = { topic: 'new', segments: [{ id: 's1', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3 }] };
    await saveDefaultPropsToFile(file, next);
    const written = readFileSync(file, 'utf8');
    expect(readDefaultProps(written)).toEqual(next);
    expect(written).toContain("import { Composition } from 'remotion'");
  });
});

describe('saveDefaultPropsToFile — verification guard', () => {
  it('rejects when the Composition has no defaultProps, leaving the original file untouched', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reel-editor-'));
    const file = join(dir, 'Root.tsx');
    const noDefaultProps = `import { Composition } from 'remotion';
export const Root = () => (
  <Composition id="CampaignReel" component={C} fps={30} width={1} height={1} />
);
`;
    writeFileSync(file, noDefaultProps, 'utf8');

    await expect(
      saveDefaultPropsToFile(file, { topic: 'new', segments: [] }),
    ).rejects.toThrow(/no defaultProps attribute/);

    const after = readFileSync(file, 'utf8');
    expect(after).toBe(noDefaultProps);
  });
});

describe('saveDefaultPropsToFile — opts.format hook', () => {
  it('applies a caller-supplied formatter to the surgically-updated source before writing', async () => {
    const file = tmpRoot();
    const next = { topic: 'formatted', segments: [] };
    const seen: { source: string; filePath: string }[] = [];
    await saveDefaultPropsToFile(file, next, {
      format: (source, filePath) => {
        seen.push({ source, filePath });
        return source.replace(/"/g, "'");
      },
    });
    const written = readFileSync(file, 'utf8');
    expect(written).not.toContain('"');
    expect(readDefaultProps(written)).toEqual(next);
    expect(seen).toHaveLength(1);
    expect(seen[0].filePath).toBe(file);
  });

  it('supports an async formatter', async () => {
    const file = tmpRoot();
    const next = { topic: 'async-formatted', segments: [] };
    await saveDefaultPropsToFile(file, next, {
      format: async (source) => {
        await Promise.resolve();
        return source.replace(/"/g, "'");
      },
    });
    const written = readFileSync(file, 'utf8');
    expect(written).not.toContain('"');
    expect(readDefaultProps(written)).toEqual(next);
  });

  it('behaves exactly as before when opts.format is absent', async () => {
    const file = tmpRoot();
    const next = { topic: 'no-format', segments: [] };
    await saveDefaultPropsToFile(file, next);
    const written = readFileSync(file, 'utf8');
    expect(readDefaultProps(written)).toEqual(next);
  });

  it('does not overwrite the target file when the formatter throws', async () => {
    const file = tmpRoot();
    const before = readFileSync(file, 'utf8');
    await expect(
      saveDefaultPropsToFile(file, { topic: 'should-not-land', segments: [] }, {
        format: () => {
          throw new Error('formatter blew up');
        },
      }),
    ).rejects.toThrow(/formatter blew up/);
    const after = readFileSync(file, 'utf8');
    expect(after).toBe(before);
  });
});

describe('createSaveHandler', () => {
  it('resolves the target path and writes props', async () => {
    const file = tmpRoot();
    const handler = createSaveHandler((body) => ({ filePath: file, compositionId: body.compositionId }));
    const res = await handler({ rootPath: file, props: { topic: 'via-handler', segments: [] }, compositionId: 'CampaignReel' });
    expect(res).toEqual({ ok: true });
    expect(readDefaultProps(readFileSync(file, 'utf8'))).toEqual({ topic: 'via-handler', segments: [] });
  });

  it('rejects a malformed body', async () => {
    const handler = createSaveHandler(() => ({ filePath: '/nope' }));
    await expect(handler({ props: {} })).rejects.toThrow(/rootPath/);
  });

  it('rejects a body missing props', async () => {
    const handler = createSaveHandler(() => ({ filePath: '/nope' }));
    await expect(handler({ rootPath: '/x' })).rejects.toThrow(
      /body must be \{ rootPath: string, props: unknown \}/,
    );
  });
});
