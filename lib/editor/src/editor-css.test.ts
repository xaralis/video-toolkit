import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const EDITOR_ROOT = path.resolve(__dirname, '..');
const CSS = path.resolve(EDITOR_ROOT, 'app/editor.css');

describe('generated editor.css', () => {
  // The generated stylesheet is committed so a brand needs no Tailwind plugin.
  // These assertions catch the failure mode that choice creates: a stale
  // artifact styles nothing, and silently — unstyled markup throws no error.
  it('exists and is not empty', () => {
    expect(fs.existsSync(CSS)).toBe(true);
    expect(fs.readFileSync(CSS, 'utf8').length).toBeGreaterThan(1000);
  });

  it('carries the ed: prefix, so it cannot collide with a brand own Tailwind', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    expect(css).toContain('.ed\\:');
  });

  it('emits the prefixed theme variables the inline styles read', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    expect(css).toContain('--ed-color-accent');
    expect(css).toContain('#7c5cff');
  });

  // THE staleness gate for the whole compile-at-core design (CLAUDE.md's
  // Quality Gates table). Every check above reads the COMMITTED file, so a
  // class added to a .tsx without a rebuild passes all three of them — the
  // stylesheet just doesn't have a rule for the new class, and nothing here
  // notices. This is the one assertion that would: rebuild from the exact
  // same input the `editor:css` script uses, and byte-compare against what's
  // committed. The build measures ~75-100ms, so there is no excuse for this
  // to be a manual `npm run editor:css && git diff --exit-code` step only —
  // automatic beats "remembered to run it".
  it('is byte-identical to a fresh build from app/editor.in.css — catches a class added without a rebuild', () => {
    const tmpOut = path.join(os.tmpdir(), `editor-css-freshness-${process.pid}-${Date.now()}.css`);
    const bin = path.resolve(EDITOR_ROOT, 'node_modules/.bin/tailwindcss');
    try {
      execFileSync(bin, ['-i', 'app/editor.in.css', '-o', tmpOut, '--minify'], {
        cwd: EDITOR_ROOT,
        stdio: 'pipe',
      });
      const fresh = fs.readFileSync(tmpOut, 'utf8');
      const committed = fs.readFileSync(CSS, 'utf8');
      expect(fresh).toBe(committed);
    } finally {
      fs.rmSync(tmpOut, { force: true });
    }
  }, 20_000);
});
