import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const CSS = path.resolve(__dirname, '../app/editor.css');

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
});
