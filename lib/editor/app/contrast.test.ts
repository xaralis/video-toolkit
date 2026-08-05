import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AA_NORMAL, contrastRatio, relativeLuminance } from './contrast';
import { EDITOR_ACCENT } from '../host/ui';

const here = path.dirname(fileURLToPath(import.meta.url));
const cssSource = fs.readFileSync(path.join(here, 'editor.in.css'), 'utf-8');

/** Read a `--color-*` token straight out of the stylesheet, so this test
 *  checks the SHIPPED values rather than a copy of them. */
function token(name: string): string {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(cssSource);
  if (!m) throw new Error(`--color-${name} not found in editor.in.css`);
  return m[1];
}

describe('contrast maths', () => {
  it('is 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#7c5cff', '#7c5cff')).toBeCloseTo(1, 5);
  });

  it('is symmetric, and independent of which colour is the background', () => {
    expect(contrastRatio('#141824', '#e2e6f0')).toBeCloseTo(contrastRatio('#e2e6f0', '#141824')!, 10);
  });

  it('returns null rather than a wrong number for an unreadable colour', () => {
    expect(relativeLuminance('rebeccapurple')).toBeNull();
    expect(relativeLuminance('#abc')).toBeNull(); // shorthand is not handled — say so, don't guess
    expect(contrastRatio('#ffffff', 'nope')).toBeNull();
  });
});

describe('the editor’s on-colour text passes AA', () => {
  // Each pair is "text on fill". A failure here is not a style nit: at 10-13px
  // an under-4.5:1 label is the difference between reading a control and
  // squinting at it, which is exactly the report that produced this test.
  const pairs: Array<[string, string, string]> = [
    ['accent button label', 'accent-ink', 'accent'],
    ['transition marker label', 'transition-marker-ink', 'transition-marker'],
    // The timeline's hint bar (LayeredTimeline.tsx) paints a 'warn'-severity
    // hint `ed:text-warn` and sits, unstyled itself, on the timeline root's
    // `ed:bg-shell` — this is the pairing every blocking edit's message was
    // promoted to (see block-reason-copy.ts) so it would actually be noticed
    // rather than reading as decoration.
    ['timeline hint bar (warn)', 'warn', 'shell'],
  ];

  for (const [what, inkToken, fillToken] of pairs) {
    it(`${what}: ${inkToken} on ${fillToken}`, () => {
      const ratio = contrastRatio(token(inkToken), token(fillToken));
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }
});

describe('the JS mirror of the accent', () => {
  it('still equals the stylesheet token it claims to mirror', () => {
    // `EDITOR_ACCENT` exists for the few consumers that cannot use a class (an
    // SVG stroke, an inline outline). Two sources of truth only stay in step
    // if something checks.
    expect(EDITOR_ACCENT.toLowerCase()).toBe(token('accent').toLowerCase());
  });
});
