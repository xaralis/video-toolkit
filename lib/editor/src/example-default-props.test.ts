import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDefaultProps } from './default-props-writer';

/**
 * The shipped reference example is the reel literal most likely to be COPIED, and
 * its own comment promises that Studio and the toolkit editor can read it out of
 * the file and write edits back in place. `readDefaultProps` only accepts the JSON
 * literal grammar — an identifier (`totalDurationMs: TOTAL_MS`) or any other
 * expression makes the file unopenable. Guard that here so the example can never
 * regress into a shape the editor refuses.
 */
// `import.meta.url` is not a file: URL under the jsdom environment, so locate the
// repo root by walking up from the runner's cwd (lib/editor) instead.
function findExampleRoot(): string {
  const rel = 'examples/layered-minimal/src/Root.tsx';
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, rel);
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error(`could not locate ${rel} above ${process.cwd()}`);
}

const ROOT_TSX = findExampleRoot();

describe('examples/layered-minimal Root.tsx is editor-readable', () => {
  const props = readDefaultProps(readFileSync(ROOT_TSX, 'utf8'), {
    compositionId: 'MinimalReel',
  }) as { reel: { meta: { totalDurationMs: number }; tracks: Record<string, unknown> } };

  it('reads back as a plain JSON-shaped object', () => {
    expect(typeof props.reel.meta.totalDurationMs).toBe('number');
    expect(Object.keys(props.reel.tracks).sort()).toEqual(
      ['audio', 'brand', 'music', 'overlays', 'video'].sort(),
    );
  });

  it('carries no non-literal expressions (identifiers, constants, calls)', () => {
    // A round-trip through JSON is lossless only if every value is a literal.
    expect(JSON.parse(JSON.stringify(props))).toEqual(props);
  });
});
