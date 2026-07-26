// lib/editor/src/media-source.test.ts — the ONE media-path rule.
//
// The two brands' conventions genuinely conflicted before this landed:
//
//   PP (campaign-reels)  rule: startsWith('recordings/') || startsWith('broll/')
//                        data: BARE filenames ('seg02.MP4')
//   roost (roost-reels)  rule: startsWith('http') || includes('/')
//                        data: FULL public-relative paths ('media/VIDEO-….mp4')
//
// Adopting PP's rule would re-prefix every roost source into
// `recordings/media/VIDEO-….mp4`. Core takes roost's — the superset — and the
// idempotence case below is the proof PP is unaffected: PP's bare filenames
// contain no slash, so they prefix exactly as they did, and PP's already-
// prefixed sources (its clip/broll renderers prefix BEFORE calling
// SegmentMedia) pass through untouched.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolveMediaSource, ROLE_FOLDERS } from '@video-toolkit/lib/theming/media-source';

describe('resolveMediaSource', () => {
  it('leaves an http source alone', () => {
    expect(resolveMediaSource('https://cdn/x.mp4', 'clip')).toBe('https://cdn/x.mp4');
    expect(resolveMediaSource('http://cdn/x.mp4', 'clip')).toBe('http://cdn/x.mp4');
  });

  // roost's actual data — the case PP's prefix-list rule would corrupt.
  it('leaves any path containing a slash alone (roost media/… convention)', () => {
    expect(resolveMediaSource('media/VIDEO-2026.mp4', 'broll')).toBe('media/VIDEO-2026.mp4');
    expect(resolveMediaSource('media/PHOTO-2026.jpg', 'photo')).toBe('media/PHOTO-2026.jpg');
    expect(resolveMediaSource('media/VIDEO-2026.mp4', 'clip')).toBe('media/VIDEO-2026.mp4');
    // roost's music bed. Under PP's prefix-list rule this became
    // `recordings/audio/boj.wav`.
    expect(resolveMediaSource('audio/boj.wav', 'audio')).toBe('audio/boj.wav');
  });

  // PP's actual data — bare filenames, must prefix exactly as today.
  it('prefixes a bare filename by role (PP convention)', () => {
    expect(resolveMediaSource('IMG_4821.MOV', 'clip')).toBe('recordings/IMG_4821.MOV');
    expect(resolveMediaSource('street.mp4', 'broll')).toBe('broll/street.mp4');
    expect(resolveMediaSource('vo-01.mp3', 'audio')).toBe('recordings/vo-01.mp3');
  });

  it('never prefixes a photo — both brands leave photo sources bare', () => {
    expect(resolveMediaSource('skyline.jpg', 'photo')).toBe('skyline.jpg');
  });

  it('never prefixes music or brand assets — their sources are already public-relative', () => {
    expect(resolveMediaSource('bed.mp3', 'music')).toBe('bed.mp3');
    expect(resolveMediaSource('logo.png', 'brand')).toBe('logo.png');
  });

  // THE load-bearing case: it is what proves PP's resolveAudioSource and this
  // rule agree on PP's data, which is the whole reason roost's rule is safe to
  // adopt. Both brands hand SegmentMedia an ALREADY-prefixed source.
  it('leaves an already-prefixed PP source alone (idempotent)', () => {
    expect(resolveMediaSource('recordings/IMG_4821.MOV', 'clip')).toBe('recordings/IMG_4821.MOV');
    expect(resolveMediaSource('broll/street.mp4', 'broll')).toBe('broll/street.mp4');
    expect(resolveMediaSource('recordings/vo-01.mp3', 'audio')).toBe('recordings/vo-01.mp3');
    // ... and applying it twice is a no-op for every shape.
    for (const raw of ['seg02.MP4', 'media/x.mp4', 'https://cdn/x.mp4']) {
      const once = resolveMediaSource(raw, 'clip');
      expect(resolveMediaSource(once, 'clip')).toBe(once);
    }
  });

  it('exposes the folder table, with no folder for photo/music/brand', () => {
    expect(ROLE_FOLDERS.clip).toBe('recordings/');
    expect(ROLE_FOLDERS.broll).toBe('broll/');
    expect(ROLE_FOLDERS.audio).toBe('recordings/');
    expect(ROLE_FOLDERS.photo).toBeUndefined();
    expect(ROLE_FOLDERS.music).toBeUndefined();
    expect(ROLE_FOLDERS.brand).toBeUndefined();
  });

  it('is pure — it never mutates or writes back (loadTranscriptSync needs the BARE source)', () => {
    const item = { source: 'seg02.MP4' };
    resolveMediaSource(item.source, 'clip');
    expect(item.source).toBe('seg02.MP4');
  });

  // TOOLCHAIN GUARD. This module is imported by lib/editor/app/LayeredTimeline.tsx,
  // which a BRAND's Vite dev server loads from outside the project tree. That
  // server's only resolve hook (createEditorViteConfig's
  // `resolve-remotion-from-project` pre-plugin) re-resolves `remotion`,
  // `remotion/*` and `@remotion/*` and nothing else — a bare specifier here
  // would fail to resolve, and the historical symptom of that is the editor
  // silently never mounting (#root empty, no console error, one line in the
  // dev-server log). Keeping the module import-free sidesteps the class
  // entirely; it is also why the timeline imports THIS FILE directly rather
  // than the ../theming barrel, which does pull in `remotion`.
  it('imports nothing — no bare specifier for a brand dev server to resolve', () => {
    // cwd is lib/editor (vitest's root), so the module sits one hop up.
    const file = path.resolve(process.cwd(), '../theming/media-source.ts');
    expect(existsSync(file)).toBe(true); // guards against a silent pass if it moves
    const src = readFileSync(file, 'utf8');
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/\brequire\s*\(/);
  });
});
