# LayeredReelComposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One core composition renders every track of the layered model identically for every brand; templates contribute only visual style. Fades become schema data, editable in the editor.

**Architecture:** New `LayeredReelComposition` in `toolkit/lib/render/` consumes the existing `buildVideoNodes` + `computeMusicEnvelope` + theming module, plus a new core audio-track builder and an overlay-routing helper. `CompositionTheme` (extends `BrandTheme`) carries the per-brand hooks. Templates become thin wrappers. Spec: `docs/superpowers/specs/2026-07-25-layered-reel-composition-design.md`.

**Tech Stack:** TypeScript, React, Remotion, Zod 3, vitest (host package: `lib/editor`).

## Global Constraints

- Core repo work happens in the submodule checkout `/Users/xaralis/Workspace/roost/video-toolkit/toolkit` on branch `feat/layered-reel-composition` off `main`; merged + pushed at end of Phase A.
- Layered-logic tests live in `lib/editor/src/` (precedent: `music-envelope.test.ts`, `derive-layered.test.ts`). Run: `cd /Users/xaralis/Workspace/roost/video-toolkit/toolkit/lib/editor && npm test`.
- Never break vendored template copies: `resolveVideoRenderer` keeps a non-optional return type for the `'clip' | 'broll' | 'photo'` call signature (overload).
- No `Co-Authored-By` lines in commits (user rule).
- Backwards-compat bar: a reel config with no fade fields renders byte-identically except where the spec explicitly changes semantics (music with explicit `endMs` now fades into the trim instead of hard-cutting).
- Phase C runs from the PP workspace `/Users/xaralis/Workspace/progpce/video-toolkit`; if this session lacks write access there, stop after Phase B and report.

---

## Phase A — core

### Task A1: Fade fields in the layered schema

**Files:**
- Modify: `lib/reel-config-base/layered-schema.ts:66-100`
- Test: `lib/editor/src/layered-schema-fades.test.ts` (create)

**Interfaces:**
- Produces: `AudioItemSchema` + `MusicLayerSchema` accept optional `fadeInMs` / `fadeOutMs` (`Ms` = non-negative number). `AudioItem` / `LayeredReel` types carry them.

- [ ] **Step 1: Write the failing test**

```ts
// lib/editor/src/layered-schema-fades.test.ts
import { describe, it, expect } from 'vitest';
import { AudioItemSchema, MusicLayerSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

describe('fade fields', () => {
  const baseAudio = { id: 'a1', startMs: 0, endMs: 2000, source: 'x.mp4', sourceInMs: 0 };

  it('audio item accepts fadeInMs/fadeOutMs', () => {
    const r = AudioItemSchema.parse({ ...baseAudio, fadeInMs: 250, fadeOutMs: 500 });
    expect(r.fadeInMs).toBe(250);
    expect(r.fadeOutMs).toBe(500);
  });

  it('audio item fades are optional', () => {
    const r = AudioItemSchema.parse(baseAudio);
    expect(r.fadeInMs).toBeUndefined();
  });

  it('rejects negative fades', () => {
    expect(() => AudioItemSchema.parse({ ...baseAudio, fadeOutMs: -1 })).toThrow();
  });

  it('music layer accepts fades', () => {
    const r = MusicLayerSchema.parse({ source: 'm.mp3', fadeInMs: 0, fadeOutMs: 1500 });
    expect(r.fadeOutMs).toBe(1500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xaralis/Workspace/roost/video-toolkit/toolkit/lib/editor && npx vitest run src/layered-schema-fades.test.ts`
Expected: FAIL — `fadeInMs` stripped by zod (`toBe(250)` gets `undefined`).

- [ ] **Step 3: Add the fields**

In `lib/reel-config-base/layered-schema.ts`, add to `AudioItemSchema` (after `mute`):

```ts
  fadeInMs: Ms.optional(), // linear gain ramp from item start
  fadeOutMs: Ms.optional(), // linear gain ramp into item end
```

and to `MusicLayerSchema` (after `endMs`):

```ts
  // Fades are first-class data (same semantics as AudioItem's) so the editor
  // can edit them and render reads them instead of hardcoded constants.
  fadeInMs: Ms.optional(),
  fadeOutMs: Ms.optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/layered-schema-fades.test.ts` → PASS. Then full suite: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit/toolkit
git add lib/reel-config-base/layered-schema.ts lib/editor/src/layered-schema-fades.test.ts
git commit -m "feat(schema): fadeInMs/fadeOutMs on audio items and music layer"
```

### Task A2: Music envelope reads fades from data

**Files:**
- Modify: `lib/reel-config-base/music-envelope.ts`
- Test: `lib/editor/src/music-envelope-fades.test.ts` (create); existing `lib/editor/src/music-envelope.test.ts` may need expectation updates (see Step 4)

**Interfaces:**
- Consumes: schema fields from Task A1.
- Produces: `computeMusicEnvelope(reel, { fps })` — unchanged signature. New semantics: fade-out length = `music.fadeOutMs ?? 1000`; fade anchors to `min(music.endMs, outro end)` (whichever exist); optional fade-in over `music.fadeInMs ?? 0` from frame 0.

- [ ] **Step 1: Write the failing test**

```ts
// lib/editor/src/music-envelope-fades.test.ts
import { describe, it, expect } from 'vitest';
import { computeMusicEnvelope } from '@video-toolkit/lib/reel-config-base/music-envelope';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const fps = 30;
const reel = (music: Partial<LayeredReel['tracks']['music']>): LayeredReel => ({
  version: 'layered-1',
  meta: { topic: 't', totalDurationMs: 10000 },
  tracks: {
    video: [
      { id: 'c1', kind: 'clip', startMs: 0, endMs: 7000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 7000 },
      { id: 'o1', kind: 'outro', startMs: 7000, endMs: 10000 },
    ],
    audio: [],
    music: { source: 'm.mp3', baseVolumeDb: -8, ...music },
    overlays: [],
    brand: [],
  },
});
const base = Math.pow(10, -8 / 20);

describe('music envelope fades from data', () => {
  it('default fadeOut is 1000ms anchored to outro end (legacy parity)', () => {
    const { volumeAt } = computeMusicEnvelope(reel({}), { fps });
    expect(volumeAt(0)).toBeCloseTo(base, 5); // steady
    expect(volumeAt(285)).toBeCloseTo(base * (1 - 15 / 30), 5); // mid-fade (outro ends f=300)
    expect(volumeAt(300)).toBe(0);
  });

  it('explicit endMs now FADES into the trim point instead of hard-cutting', () => {
    const { volumeAt } = computeMusicEnvelope(reel({ endMs: 5000 }), { fps }); // end f=150
    expect(volumeAt(100)).toBeCloseTo(base, 5);
    expect(volumeAt(135)).toBeCloseTo(base * (1 - 15 / 30), 5);
    expect(volumeAt(150)).toBe(0);
  });

  it('fadeOutMs from data overrides the 1000ms default', () => {
    const { volumeAt } = computeMusicEnvelope(reel({ fadeOutMs: 2000 }), { fps }); // fade f=240..300
    expect(volumeAt(240)).toBeCloseTo(base, 5);
    expect(volumeAt(270)).toBeCloseTo(base * 0.5, 5);
  });

  it('fadeOutMs: 0 restores the hard cut', () => {
    const { volumeAt } = computeMusicEnvelope(reel({ endMs: 5000, fadeOutMs: 0 }), { fps });
    expect(volumeAt(149)).toBeCloseTo(base, 5);
    expect(volumeAt(150)).toBe(0);
  });

  it('fadeInMs ramps up from frame 0', () => {
    const { volumeAt } = computeMusicEnvelope(reel({ fadeInMs: 1000 }), { fps });
    expect(volumeAt(0)).toBe(0);
    expect(volumeAt(15)).toBeCloseTo(base * 0.5, 5);
    expect(volumeAt(30)).toBeCloseTo(base, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/music-envelope-fades.test.ts`
Expected: FAIL — endMs case hard-cuts (volumeAt(135) equals base, not mid-fade), fadeOutMs ignored.

- [ ] **Step 3: Implement**

Replace the fade block of `computeMusicEnvelope` in `lib/reel-config-base/music-envelope.ts`:

```ts
export function computeMusicEnvelope(reel: LayeredReel, opts: { fps: number }): MusicEnvelope {
  const { fps } = opts;
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);
  const outroItem = reel.tracks.video.find((v) => v.kind === 'outro');
  const outroEndFrame = outroItem ? msToFrames(outroItem.endMs) : null;
  const baseVolume = Math.pow(10, (reel.tracks.music.baseVolumeDb ?? -8) / 20);
  const musicEndFrame = reel.tracks.music.endMs !== undefined ? msToFrames(reel.tracks.music.endMs) : null;

  // Fades are data (spec 2026-07-25): fadeOut defaults to the legacy 1s and
  // anchors to whichever end comes first — the explicit music trim (endMs) or
  // the outro end. fadeIn defaults to 0 (off), ramping from frame 0.
  const fadeOutFrames = msToFrames(reel.tracks.music.fadeOutMs ?? 1000);
  const fadeInFrames = msToFrames(reel.tracks.music.fadeInMs ?? 0);
  const ends = [musicEndFrame, outroEndFrame].filter((x): x is number => x !== null);
  const fadeEndFrame = ends.length > 0 ? Math.min(...ends) : null;
  const fadeStartFrame = fadeEndFrame !== null && fadeOutFrames > 0 ? fadeEndFrame - fadeOutFrames : null;

  const findPrimaryVideoItemAt = (f: number): VideoItem | null => {
    let primary: VideoItem | null = null;
    for (const v of reel.tracks.video) {
      const sf = msToFrames(v.startMs);
      const ef = msToFrames(v.endMs);
      if (f >= sf && f < ef) {
        if (!primary || sf > msToFrames(primary.startMs)) primary = v;
      }
    }
    return primary;
  };

  const volumeAt = (f: number): number => {
    if (musicEndFrame !== null && f >= musicEndFrame) return 0;
    if (outroEndFrame !== null && f >= outroEndFrame) return 0;
    const item = findPrimaryVideoItemAt(f);
    const boostDb = item?.musicBoostDb ?? 0;
    let factor = Math.pow(10, boostDb / 20);
    if (fadeStartFrame !== null && fadeEndFrame !== null && f >= fadeStartFrame && f < fadeEndFrame) {
      factor *= 1 - (f - fadeStartFrame) / fadeOutFrames;
    }
    if (fadeInFrames > 0 && f < fadeInFrames) {
      factor *= f / fadeInFrames;
    }
    return baseVolume * factor;
  };

  const totalFrames = msToFrames(reel.meta.totalDurationMs);
  const verts = new Set<number>([0, totalFrames]);
  for (const v of reel.tracks.video) verts.add(msToFrames(v.startMs));
  if (fadeInFrames > 0) verts.add(fadeInFrames);
  if (fadeStartFrame !== null) verts.add(fadeStartFrame);
  if (outroEndFrame !== null) { verts.add(outroEndFrame); verts.add(Math.max(0, outroEndFrame - 1)); }
  if (musicEndFrame !== null) { verts.add(musicEndFrame); verts.add(Math.max(0, musicEndFrame - 1)); }
  const points = [...verts]
    .filter((f) => f >= 0 && f <= totalFrames)
    .sort((a, b) => a - b)
    .map((frame) => ({ frame, gain: volumeAt(frame) }));

  return { volumeAt, points };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/music-envelope-fades.test.ts` → PASS. Then `npm test`. If `src/music-envelope.test.ts` asserts a **hard cut at `endMs`**, update that expectation to the new fade semantics (this change IS the task — note it in the commit body). All other failures are regressions: fix the implementation, not the test.

- [ ] **Step 5: Commit**

```bash
git add lib/reel-config-base/music-envelope.ts lib/editor/src/music-envelope-fades.test.ts lib/editor/src/music-envelope.test.ts
git commit -m "feat(envelope): music fades read fadeInMs/fadeOutMs from data; fade into explicit endMs"
```

### Task A3: Pure audio gain math

**Files:**
- Create: `lib/render/audio-gain.ts`
- Test: `lib/editor/src/audio-gain.test.ts` (create)

**Interfaces:**
- Consumes: `AudioItem` (Task A1 fields).
- Produces: `audioGainAt(item: AudioItem, localFrame: number, fps: number): number` — linear gain for a frame local to the item's Sequence. Used by Task A4.

- [ ] **Step 1: Write the failing test**

```ts
// lib/editor/src/audio-gain.test.ts
import { describe, it, expect } from 'vitest';
import { audioGainAt } from '@video-toolkit/lib/render/audio-gain';
import type { AudioItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const fps = 30;
const item = (over: Partial<AudioItem> = {}): AudioItem => ({
  id: 'a1', startMs: 1000, endMs: 4000, source: 'x.mp4', sourceInMs: 0, ...over,
});

describe('audioGainAt', () => {
  it('defaults to unity gain (volumeDb 0)', () => {
    expect(audioGainAt(item(), 10, fps)).toBeCloseTo(1, 5);
  });
  it('applies volumeDb', () => {
    expect(audioGainAt(item({ volumeDb: -6 }), 10, fps)).toBeCloseTo(Math.pow(10, -6 / 20), 5);
  });
  it('mute wins', () => {
    expect(audioGainAt(item({ mute: true, volumeDb: 6 }), 10, fps)).toBe(0);
  });
  it('fadeIn ramps from local frame 0', () => {
    const a = item({ fadeInMs: 500 }); // 15 frames
    expect(audioGainAt(a, 0, fps)).toBe(0);
    expect(audioGainAt(a, 7.5, fps)).toBeCloseTo(0.5, 5);
    expect(audioGainAt(a, 15, fps)).toBeCloseTo(1, 5);
  });
  it('fadeOut ramps into the item end (span 3000ms = 90 frames)', () => {
    const a = item({ fadeOutMs: 1000 }); // fade frames 60..90
    expect(audioGainAt(a, 60, fps)).toBeCloseTo(1, 5);
    expect(audioGainAt(a, 75, fps)).toBeCloseTo(0.5, 5);
    expect(audioGainAt(a, 90, fps)).toBe(0);
  });
  it('overlapping fades multiply', () => {
    const a = item({ endMs: 2000, fadeInMs: 1000, fadeOutMs: 1000 }); // 30-frame span
    expect(audioGainAt(a, 15, fps)).toBeCloseTo(0.5 * 0.5, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/audio-gain.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/render/audio-gain.ts — pure per-frame gain for an audio-track item.
// Local frame = frames since the item's own Sequence start. No Remotion import
// so it unit-tests in core (same split as video-track-layout).
import type { AudioItem } from '../reel-config-base/layered-schema';

export function audioGainAt(item: AudioItem, localFrame: number, fps: number): number {
  if (item.mute) return 0;
  const msToFrames = (ms: number) => (ms / 1000) * fps;
  const base = Math.pow(10, (item.volumeDb ?? 0) / 20);
  const spanF = msToFrames(item.endMs - item.startMs);
  const fadeInF = msToFrames(item.fadeInMs ?? 0);
  const fadeOutF = msToFrames(item.fadeOutMs ?? 0);
  let factor = 1;
  if (fadeInF > 0 && localFrame < fadeInF) factor *= Math.max(0, localFrame / fadeInF);
  if (fadeOutF > 0 && localFrame > spanF - fadeOutF) factor *= Math.max(0, (spanF - localFrame) / fadeOutF);
  return base * factor;
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/audio-gain.test.ts` → PASS; `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/render/audio-gain.ts lib/editor/src/audio-gain.test.ts
git commit -m "feat(render): audioGainAt — pure per-frame gain with volumeDb/mute/fades"
```

### Task A4: buildAudioNodes

**Files:**
- Create: `lib/render/audio-track.tsx`

**Interfaces:**
- Consumes: `audioGainAt` (A3).
- Produces: `buildAudioNodes(items: AudioItem[], opts: { fps: number; resolveSource?: (raw: string) => string }): React.ReactNode[]` and `defaultResolveAudioSource(raw: string): string`. Used by Task A6.

- [ ] **Step 1: Implement** (JSX assembly — thin over tested math, mirrors `video-track.tsx`'s role; no separate unit test, exercised by template smoke in Phase B)

```tsx
// lib/render/audio-track.tsx — the shared AUDIO TRACK assembly. Lifted from
// campaign-reels' LayeredCampaignReel.tsx audioNodes map (the only template
// that mounted the audio track — see spec 2026-07-25) so every brand renders
// voice/bed items identically. Gain math is pure in ./audio-gain.
import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import { audioGainAt } from './audio-gain';
import type { AudioItem } from '../reel-config-base/layered-schema';

// AudioItem.source is a bare filename by convention (derive-layered emits the
// clip's own source). Campaign's folder convention is the core default; a
// brand with different folders overrides via CompositionTheme.resolveAudioSource.
export function defaultResolveAudioSource(raw: string): string {
  return raw.startsWith('recordings/') || raw.startsWith('broll/') ? raw : `recordings/${raw}`;
}

export function buildAudioNodes(
  items: AudioItem[],
  opts: { fps: number; resolveSource?: (raw: string) => string },
): React.ReactNode[] {
  const resolve = opts.resolveSource ?? defaultResolveAudioSource;
  const msToFrames = (ms: number) => Math.round((ms / 1000) * opts.fps);
  return items.map((a) => {
    const from = msToFrames(a.startMs);
    const durationInFrames = Math.max(1, msToFrames(a.endMs) - from);
    return (
      <Sequence key={a.id} from={from} durationInFrames={durationInFrames} name={a.id}>
        <Audio
          src={staticFile(resolve(a.source))}
          startFrom={msToFrames(a.sourceInMs)}
          volume={(f) => audioGainAt(a, f, opts.fps)}
        />
      </Sequence>
    );
  });
}
```

- [ ] **Step 2: Type-check** — `cd /Users/xaralis/Workspace/roost/video-toolkit/toolkit/lib/editor && npx tsc --noEmit` → clean (editor tsconfig covers `@video-toolkit/lib` paths; if it excludes `lib/render`, verify instead from the roost template in Phase B and note it).

- [ ] **Step 3: Commit**

```bash
git add lib/render/audio-track.tsx
git commit -m "feat(render): buildAudioNodes — shared audio-track assembly with data-driven fades"
```

### Task A5: Theming contract widening

**Files:**
- Modify: `lib/theming/types.ts`, `lib/theming/brand-theme.ts`, `lib/theming/index.ts`
- Test: `lib/editor/src/theming-widening.test.ts` (create)

**Interfaces:**
- Produces:
  - `VideoKind = 'clip' | 'broll' | 'photo' | 'multi-clip' | 'card' | 'outro'`
  - `VideoRenderProps` + `anchoredOverlays?: OverlayItem[]` + `boundAudio?: AudioItem`
  - `OverlayRouting = 'track' | 'anchored' | 'singleton'`; `OverlayItemRegistration = { routing?: OverlayRouting; render?: (item: OverlayItem) => React.ReactNode }`
  - `CompositionTheme extends BrandTheme { background: string; overlayItems?: Record<string, OverlayItemRegistration>; prepareVideoTrack?: (items: VideoItem[]) => VideoItem[]; renderBrandTrack?: (items: BrandLayerItem[]) => React.ReactNode; resolveAudioSource?: (raw: string) => string }`
  - `resolveVideoRenderer` overloads: footage kinds → `VideoRenderer`; full `VideoKind` → `VideoRenderer | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// lib/editor/src/theming-widening.test.ts
import { describe, it, expect } from 'vitest';
import { resolveVideoRenderer } from '@video-toolkit/lib/theming';
import type { CompositionTheme, VideoRenderer } from '@video-toolkit/lib/theming';

const Dummy: VideoRenderer = () => null;

describe('widened video kinds', () => {
  it('unregistered non-footage kind resolves to undefined (no generic)', () => {
    expect(resolveVideoRenderer({ accentSlots: [] }, 'outro')).toBeUndefined();
    expect(resolveVideoRenderer({ accentSlots: [] }, 'card')).toBeUndefined();
  });
  it('registered outro renderer wins', () => {
    const theme: CompositionTheme = { accentSlots: [], background: '#000', video: { outro: { renderer: Dummy } } };
    expect(resolveVideoRenderer(theme, 'outro')).toBe(Dummy);
  });
  it('footage kinds keep their core generic fallback', () => {
    expect(resolveVideoRenderer({ accentSlots: [] }, 'clip')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/theming-widening.test.ts` → FAIL (tsc/type error: `'outro'` not assignable to `VideoKind`, `CompositionTheme` not exported).

- [ ] **Step 3: Implement**

`lib/theming/types.ts` — replace the `VideoKind` line and `VideoRenderProps`, append new types:

```ts
import type { VideoItem, AudioItem, OverlayItem, BrandLayerItem } from '../reel-config-base/layered-schema';

/** All video-track item kinds. Footage kinds have a core generic renderer
 *  (SegmentMedia); the rest render only when the brand registers them. */
export type VideoKind = 'clip' | 'broll' | 'photo' | 'multi-clip' | 'card' | 'outro';
export type FootageVideoKind = 'clip' | 'broll' | 'photo';

export interface VideoRenderProps {
  item: VideoItem;
  handles: { inHalf: number; outHalf: number };
  config?: unknown;
  /** Overlay items anchored to this video item whose kind routes 'anchored'
   *  (core-supplied — e.g. campaign's title, whose caption-lift lives in the body). */
  anchoredOverlays?: OverlayItem[];
  /** The audio item following this video item (captions derive from it). */
  boundAudio?: AudioItem;
}

/** How an overlay kind reaches the screen. 'track' (default): one absolute
 *  Sequence per item. 'anchored': delivered to the owning video renderer via
 *  anchoredOverlays instead (items without anchorVideoId fall back to track).
 *  'singleton': mounted once, unwrapped (e.g. a chevron marker). */
export type OverlayRouting = 'track' | 'anchored' | 'singleton';

export interface OverlayItemRegistration {
  routing?: OverlayRouting;
  /** Item-based renderer. Optional for 'anchored' (the video body renders it)
   *  and for the 'text'/'quote-pull' kinds (core text adapter is the default). */
  render?: (item: OverlayItem) => React.ReactNode;
}

/** The full composition contract a brand hands to LayeredReelComposition. */
export interface CompositionTheme extends BrandTheme {
  /** Root AbsoluteFill background. */
  background: string;
  /** Per-overlay-kind routing + renderer, any kind (core knows modes, not names). */
  overlayItems?: Record<string, OverlayItemRegistration>;
  /** Pre-pass over the video track before buildVideoNodes (e.g. brand-owned
   *  transition asset injection). */
  prepareVideoTrack?: (items: VideoItem[]) => VideoItem[];
  /** Renders the whole brand track (watermark/disclaimer) — one hook, the
   *  brand decides how many components that is. */
  renderBrandTrack?: (items: BrandLayerItem[]) => React.ReactNode;
  /** Override the audio-source folder convention (default: recordings/). */
  resolveAudioSource?: (raw: string) => string;
}
```

`lib/theming/brand-theme.ts` — retype the generic map and overload the resolver:

```ts
import type { FootageVideoKind } from './types';

const GENERIC_VIDEO_RENDERERS: Record<FootageVideoKind, VideoRenderer> = {
  clip: SegmentMedia,
  broll: SegmentMedia,
  photo: SegmentMedia,
};

/** Footage kinds always resolve (core generic fallback); other kinds resolve
 *  only when the brand registered them. Overloads keep pre-widening call
 *  sites (guard-then-resolve on footage kinds) compiling non-optionally. */
export function resolveVideoRenderer(theme: BrandTheme, kind: FootageVideoKind): VideoRenderer;
export function resolveVideoRenderer(theme: BrandTheme, kind: VideoKind): VideoRenderer | undefined;
export function resolveVideoRenderer(theme: BrandTheme, kind: VideoKind): VideoRenderer | undefined {
  return theme.video?.[kind]?.renderer ?? GENERIC_VIDEO_RENDERERS[kind as FootageVideoKind];
}
```

`lib/theming/index.ts` — add to the type re-export: `FootageVideoKind`, `OverlayRouting`, `OverlayItemRegistration`, `CompositionTheme`.

Note: `BrandTheme.video` is `Partial<Record<VideoKind, VideoRegistration>>` — widening `VideoKind` widens it automatically.

- [ ] **Step 4: Run tests** — `npx vitest run src/theming-widening.test.ts` → PASS; `npm test` + `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib/theming/types.ts lib/theming/brand-theme.ts lib/theming/index.ts lib/editor/src/theming-widening.test.ts
git commit -m "feat(theming): CompositionTheme — widened video kinds, overlay routing, brand/audio hooks"
```

### Task A6: Overlay routing helper + LayeredReelComposition

**Files:**
- Create: `lib/render/overlay-routing.ts`, `lib/render/layered-composition.tsx`
- Test: `lib/editor/src/overlay-routing.test.ts` (create)

**Interfaces:**
- Consumes: A2 envelope, A4 `buildAudioNodes`/`defaultResolveAudioSource`, A5 `CompositionTheme`.
- Produces:
  - `routeOverlays(overlays: OverlayItem[], registrations: Record<string, OverlayItemRegistration> | undefined): { track: OverlayItem[]; singleton: OverlayItem[]; anchored: Map<string, OverlayItem[]> }` (anchored keyed by `anchorVideoId`)
  - `LayeredReelComposition: React.FC<{ reel: LayeredReel; theme: CompositionTheme }>`

- [ ] **Step 1: Write the failing test**

```ts
// lib/editor/src/overlay-routing.test.ts
import { describe, it, expect } from 'vitest';
import { routeOverlays } from '@video-toolkit/lib/render/overlay-routing';
import type { OverlayItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const o = (id: string, kind: string, anchorVideoId?: string): OverlayItem => ({
  id, startMs: 0, endMs: 1000, content: { kind }, anchorVideoId,
});

describe('routeOverlays', () => {
  const regs = {
    title: { routing: 'anchored' as const },
    chevron: { routing: 'singleton' as const },
    'stat-callout': {},
  };
  it('defaults unregistered and routing-less kinds to track', () => {
    const r = routeOverlays([o('a', 'text'), o('b', 'stat-callout')], regs);
    expect(r.track.map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('splits anchored by anchorVideoId', () => {
    const r = routeOverlays([o('t1', 'title', 'seg-001'), o('t2', 'title', 'seg-002')], regs);
    expect(r.track).toEqual([]);
    expect(r.anchored.get('seg-001')![0].id).toBe('t1');
    expect(r.anchored.get('seg-002')![0].id).toBe('t2');
  });
  it('anchored without anchorVideoId falls back to track (stays visible)', () => {
    const r = routeOverlays([o('t3', 'title')], regs);
    expect(r.track.map((x) => x.id)).toEqual(['t3']);
  });
  it('singletons collected separately', () => {
    const r = routeOverlays([o('c', 'chevron')], regs);
    expect(r.singleton.map((x) => x.id)).toEqual(['c']);
  });
  it('no registrations → everything on track', () => {
    const r = routeOverlays([o('a', 'title')], undefined);
    expect(r.track.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/overlay-routing.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement the helper**

```ts
// lib/render/overlay-routing.ts — pure routing of overlay-track items per the
// brand's registrations (spec 2026-07-25). Core knows the MODES, never kind names.
import type { OverlayItem } from '../reel-config-base/layered-schema';
import type { OverlayItemRegistration } from '../theming/types';

export function overlayKind(item: OverlayItem): string {
  return ((item.content as Record<string, unknown>).kind as string) ?? '';
}

export function routeOverlays(
  overlays: OverlayItem[],
  registrations: Record<string, OverlayItemRegistration> | undefined,
): { track: OverlayItem[]; singleton: OverlayItem[]; anchored: Map<string, OverlayItem[]> } {
  const track: OverlayItem[] = [];
  const singleton: OverlayItem[] = [];
  const anchored = new Map<string, OverlayItem[]>();
  for (const item of overlays) {
    const routing = registrations?.[overlayKind(item)]?.routing ?? 'track';
    if (routing === 'singleton') {
      singleton.push(item);
    } else if (routing === 'anchored' && item.anchorVideoId) {
      const list = anchored.get(item.anchorVideoId) ?? [];
      list.push(item);
      anchored.set(item.anchorVideoId, list);
    } else {
      track.push(item); // 'track', or 'anchored' with no anchor — keep it visible
    }
  }
  return { track, singleton, anchored };
}
```

- [ ] **Step 4: Implement the composition**

```tsx
// lib/render/layered-composition.tsx — ONE assembly for the whole layered
// model. Every brand renders every track identically; the CompositionTheme
// contributes only look (renderers, background, routing) — see spec
// docs/superpowers/specs/2026-07-25-layered-reel-composition-design.md.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import type { LayeredReel, OverlayItem } from '../reel-config-base/layered-schema';
import { computeMusicEnvelope } from '../reel-config-base/music-envelope';
import type { CompositionTheme, Placement } from '../theming';
import { resolveOverlayRenderer, overlayConfig, resolveVideoRenderer, videoConfig, DEFAULT_PLACEMENT } from '../theming';
import { buildVideoNodes } from './video-track';
import { buildAudioNodes } from './audio-track';
import { routeOverlays, overlayKind } from './overlay-routing';

// The default renderer for 'text' (and its legacy 'quote-pull' alias): adapts
// the raw OverlayItem to the theming module's text contract, so brands keep
// registering their Text via BrandTheme.overlays.text exactly as before.
const TrackTextOverlay: React.FC<{ item: OverlayItem; theme: CompositionTheme }> = ({ item, theme }) => {
  const Renderer = resolveOverlayRenderer(theme, 'text');
  const content = item.content as { text?: string; reveal?: 'line' | 'all' | 'none'; hide?: 'fade' | 'none'; fontSize?: number };
  return (
    <Renderer
      text={content.text ?? ''}
      placement={(item.position as Placement) ?? DEFAULT_PLACEMENT}
      fontSize={content.fontSize}
      reveal={content.reveal}
      hide={content.hide}
      palette={theme.accentSlots}
      config={overlayConfig(theme, 'text')}
      appearAtMs={0}
      durationMs={item.endMs - item.startMs}
    />
  );
};

const TEXT_KINDS = new Set(['text', 'quote-pull']);

export const LayeredReelComposition: React.FC<{ reel: LayeredReel; theme: CompositionTheme }> = ({ reel, theme }) => {
  const { fps, width, height } = useVideoConfig();
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);

  const { track, singleton, anchored } = routeOverlays(reel.tracks.overlays, theme.overlayItems);

  // ---- video ----------------------------------------------------------------
  const videoItems = theme.prepareVideoTrack ? theme.prepareVideoTrack(reel.tracks.video) : reel.tracks.video;
  const videoNodes = buildVideoNodes(videoItems, {
    width,
    height,
    fps,
    renderItem: (item, handles) => {
      const Renderer = resolveVideoRenderer(theme, item.kind);
      if (!Renderer) return null; // kind the brand didn't register (e.g. roost multi-clip)
      return (
        <Renderer
          item={item}
          handles={handles}
          config={videoConfig(theme, item.kind)}
          anchoredOverlays={anchored.get(item.id) ?? []}
          boundAudio={reel.tracks.audio.find((a) => a.followsVideoId === item.id)}
        />
      );
    },
  });

  // ---- audio (voice/beds) -----------------------------------------------------
  const audioNodes = buildAudioNodes(reel.tracks.audio, { fps, resolveSource: theme.resolveAudioSource });

  // ---- music -------------------------------------------------------------------
  const { volumeAt } = computeMusicEnvelope(reel, { fps });
  const musicSource = reel.tracks.music.source;

  // ---- overlays ------------------------------------------------------------------
  const renderTrackItem = (item: OverlayItem): React.ReactNode => {
    const reg = theme.overlayItems?.[overlayKind(item)];
    if (reg?.render) return reg.render(item);
    if (TEXT_KINDS.has(overlayKind(item))) return <TrackTextOverlay item={item} theme={theme} />;
    return null;
  };
  const overlayNodes = track.map((item) => {
    const from = msToFrames(item.startMs);
    const durationInFrames = msToFrames(item.endMs) - from;
    if (durationInFrames <= 0) return null;
    const node = renderTrackItem(item);
    if (node === null) return null;
    return (
      <Sequence key={item.id} from={from} durationInFrames={durationInFrames} name={item.id}>
        {node}
      </Sequence>
    );
  });
  const singletonNodes = singleton.map((item) => (
    <React.Fragment key={item.id}>{theme.overlayItems?.[overlayKind(item)]?.render?.(item) ?? null}</React.Fragment>
  ));

  return (
    <AbsoluteFill style={{ backgroundColor: theme.background }}>
      {videoNodes}
      {audioNodes}
      {musicSource && (
        <Audio src={musicSource.startsWith('http') ? musicSource : staticFile(musicSource)} volume={volumeAt} />
      )}
      {overlayNodes}
      {singletonNodes}
      {theme.renderBrandTrack ? theme.renderBrandTrack(reel.tracks.brand) : null}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 5: Run tests** — `npx vitest run src/overlay-routing.test.ts` → PASS; `npm test` + `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add lib/render/overlay-routing.ts lib/render/layered-composition.tsx lib/editor/src/overlay-routing.test.ts
git commit -m "feat(render): LayeredReelComposition — one core assembly for all layered tracks"
```

### Task A7: Editor fade fields

**Files:**
- Modify: `lib/editor/app/LayeredInspector.tsx:517-519` (audio lane), `:567-583` (music lane)

**Interfaces:**
- Consumes: schema fields (A1). Envelope drawing on the Music lane updates automatically (it reads `computeMusicEnvelope().points`).

- [ ] **Step 1: Audio lane — add fades next to Volume**

Replace the single-field `Row` holding `Volume (dB)` (line ~517) with:

```tsx
        <Row>
          <NumberField lbl="Volume (dB)" value={a.volumeDb} onCommit={(n) => patchItem('audio', id, { volumeDb: n })} />
        </Row>
        <Row>
          <NumberField lbl="Fade in (s)" step={0.05} value={(a.fadeInMs ?? 0) / 1000} onCommit={(n) => patchItem('audio', id, { fadeInMs: n > 0 ? Math.round(n * 1000) : undefined })} />
          <NumberField lbl="Fade out (s)" step={0.05} value={(a.fadeOutMs ?? 0) / 1000} onCommit={(n) => patchItem('audio', id, { fadeOutMs: n > 0 ? Math.round(n * 1000) : undefined })} />
        </Row>
```

- [ ] **Step 2: Music lane — add fades after End (s)**

After the `End (s)` NumberField (line ~577), insert:

```tsx
        <Row>
          <NumberField lbl="Fade in (s)" step={0.05} value={(m.fadeInMs ?? 0) / 1000} onCommit={(n) => patchMusic({ fadeInMs: n > 0 ? Math.round(n * 1000) : undefined })} />
          <NumberField lbl="Fade out (s)" step={0.05} value={(m.fadeOutMs ?? 1000) / 1000} onCommit={(n) => patchMusic({ fadeOutMs: Math.round(n * 1000) })} />
        </Row>
```

and extend the hint `<div>` below to:

```
The effective envelope (base + each clip's music boost + fades) is drawn on the Music lane. Set End to 0 to follow the content end again; Fade out 0 = hard cut. The reel is always as long as its furthest-reaching track.
```

(Music fade-out shows the effective default 1.0 s; committing 0 stores an explicit `fadeOutMs: 0` = hard cut, matching the envelope. Audio-item fades treat 0 as "off" and store `undefined`.)

- [ ] **Step 3: Verify** — `npm test` + `npx tsc --noEmit` → clean. (Inspector has no per-lane snapshot test; field behavior is covered by manual smoke in B4.)

- [ ] **Step 4: Commit**

```bash
git add lib/editor/app/LayeredInspector.tsx
git commit -m "feat(editor): fade in/out fields on music and audio inspectors"
```

### Task A8: Merge + push core

- [ ] **Step 1:** `cd /Users/xaralis/Workspace/roost/video-toolkit/toolkit && npm test --prefix lib/editor && git checkout main && git merge --no-ff feat/layered-reel-composition -m "feat: LayeredReelComposition — unified core assembly + data-driven fades" && git push origin main`
- [ ] **Step 2:** Note the new main SHA for Phase B.

---

## Phase B — roost-reels migration (ROOST repo)

Work in `/Users/xaralis/Workspace/roost/video-toolkit` (parent repo; submodule already points at the Phase A checkout).

### Task B1: Outro renderer + composition theme

**Files:**
- Create: `templates/roost-reels/src/outro/OutroVideoItem.tsx`, `templates/roost-reels/src/config/composition-theme.tsx`
- Reference (code moves FROM here): `templates/roost-reels/src/LayeredRoostReel.tsx:60-113,184-202`

**Interfaces:**
- Consumes: `CompositionTheme`, `VideoRenderProps` (A5).
- Produces: `compositionTheme: CompositionTheme` consumed by Task B2. `OutroVideoItem: VideoRenderer`.

- [ ] **Step 1: OutroVideoItem** — move `renderOutro` + `LOGO_REVEAL_FRAMES` out of `LayeredRoostReel.tsx` verbatim, as a component:

```tsx
// templates/roost-reels/src/outro/OutroVideoItem.tsx — the outro video-track
// item as a theming-module VideoRenderer (registered in composition-theme).
// The outro carries no transition props — its entrance is the previous clip's
// transitionOut, rendered at the cut by the shared engine.
import { useVideoConfig } from 'remotion';
import type { VideoRenderProps } from '@video-toolkit/lib/theming';
import { Outro, type OutroVariant } from './Outro';

const LOGO_REVEAL_FRAMES = 48; // ~1.6s logo reveal (verbatim from RoostReel.tsx)

export const OutroVideoItem: React.FC<VideoRenderProps> = ({ item }) => {
  const { fps } = useVideoConfig();
  const props = (item.props ?? {}) as {
    style?: string;
    variant?: string;
    logoDelaySec?: number;
    framesPerBeat?: number;
    kickFrames?: number[];
  };
  const outroStartF = Math.round((item.startMs / 1000) * fps);
  const logoDelayFrames = Math.round((props.logoDelaySec ?? 0.5) * fps);
  const beatOffsetFrames = outroStartF + logoDelayFrames;
  return (
    <Outro
      style={(props.style as 'organic' | 'fade' | 'bloom' | 'static' | 'heartbeat') ?? 'organic'}
      variant={(props.variant as OutroVariant) ?? 'sand-brown'}
      logoDelayFrames={logoDelayFrames}
      logoRevealFrames={LOGO_REVEAL_FRAMES}
      framesPerBeat={props.framesPerBeat ?? 24}
      beatOffsetFrames={beatOffsetFrames}
      kickFrames={props.kickFrames ?? []}
    />
  );
};
```

- [ ] **Step 2: composition-theme.tsx** — move `withBurnLook` + the watermark block:

```tsx
// templates/roost-reels/src/config/composition-theme.tsx — roost's full
// CompositionTheme: brandTheme (accent slots + Text/RoostSegment renderers)
// plus the assembly-level hooks LayeredReelComposition consumes.
import { Sequence, useVideoConfig } from 'remotion';
import type { CompositionTheme } from '@video-toolkit/lib/theming';
import type { VideoItem, BrandLayerItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { brandTheme } from './brand-theme';
import { theme } from './theme';
import { Watermark, type WatermarkVariant } from '../overlays/Watermark';
import { OutroVideoItem } from '../outro/OutroVideoItem';

// Brand-owned burn look (moved verbatim from LayeredRoostReel): the derivation
// stores only { kind: 'burn', frames }; mask + glow are roost's own.
const withBurnLook = (items: VideoItem[]): VideoItem[] =>
  items.map((it) =>
    (it.transitionOut as { kind?: string } | undefined)?.kind === 'burn'
      ? { ...it, transitionOut: { ...it.transitionOut, mask: 'brand/burn-mask.png', glowColor: theme.colors.paper } }
      : it,
  );

// Watermark brand item → Sequence spanning [0, endMs). A component (not a bare
// function) so useVideoConfig is a legal hook call.
const RoostBrandTrack: React.FC<{ items: BrandLayerItem[] }> = ({ items }) => {
  const { fps } = useVideoConfig();
  const watermarkItem = items.find((b) => b.kind === 'watermark');
  if (!watermarkItem) return null;
  const wmDuration = Math.round((watermarkItem.endMs / 1000) * fps);
  if (wmDuration <= 0) return null;
  const props = (watermarkItem.props ?? {}) as { asset?: string; corner?: string; variant?: string };
  return (
    <Sequence name="watermark" from={0} durationInFrames={wmDuration}>
      <Watermark
        asset={props.asset ?? theme.watermark.asset}
        corner={props.corner ?? theme.watermark.corner}
        sizePx={theme.watermark.sizePx}
        variant={(props.variant as WatermarkVariant) ?? 'black'}
      />
    </Sequence>
  );
};

export const compositionTheme: CompositionTheme = {
  ...brandTheme,
  background: theme.colors.paper,
  video: { ...brandTheme.video, outro: { renderer: OutroVideoItem } },
  prepareVideoTrack: withBurnLook,
  renderBrandTrack: (items) => <RoostBrandTrack items={items} />,
};
```

- [ ] **Step 3: Type-check** — `cd /Users/xaralis/Workspace/roost/video-toolkit/templates/roost-reels && npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit
git add templates/roost-reels/src/outro/OutroVideoItem.tsx templates/roost-reels/src/config/composition-theme.tsx
git commit -m "feat(roost): composition theme — outro renderer, burn pre-pass, brand track hook"
```

### Task B2: LayeredRoostReel → thin wrapper

**Files:**
- Modify: `templates/roost-reels/src/LayeredRoostReel.tsx` (full rewrite, 219 → ~30 lines)

**Interfaces:**
- Consumes: `LayeredReelComposition` (A6), `compositionTheme` (B1).
- Produces: unchanged exports `LayeredRoostReel: React.FC<{ reel: LayeredReel }>` and `roostReelDurationInFrames(reel, fps)` — `Root.tsx` and `.editor/main.tsx` keep compiling untouched.

- [ ] **Step 1: Rewrite the file**

```tsx
// LayeredRoostReel — thin wrapper: ALL track assembly (video/audio/music/
// overlays/brand) is core's LayeredReelComposition; roost contributes only
// look via composition-theme.tsx. Roost thereby renders the audio (voice)
// track and the shared music envelope like every other brand — see
// toolkit/docs/superpowers/specs/2026-07-25-layered-reel-composition-design.md.
import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { compositionTheme } from './config/composition-theme';
import { loadBrandFonts } from './lib/load-fonts';

loadBrandFonts();

// Single source of truth for the reel length — Root.tsx's calculateMetadata
// MUST use this too so the composition duration and the render never drift.
export const roostReelDurationInFrames = (reel: LayeredReel, fps: number): number =>
  Math.round((reel.meta.totalDurationMs / 1000) * fps);

export const LayeredRoostReel: React.FC<{ reel: LayeredReel }> = ({ reel }) => (
  <LayeredReelComposition reel={reel} theme={compositionTheme} />
);
```

- [ ] **Step 2: Verify** — from `templates/roost-reels/`: `npx tsc --noEmit` → clean; `npm test` (vitest) → PASS; `npx remotion compositions src/index.ts` lists `LayeredRoostReel` (bundle sanity — use arm64 node: `export PATH="/Users/xaralis/.nvm/versions/node/v20.18.1/bin:$PATH"`).

- [ ] **Step 3: Parity notes to verify by eye in Step 2's Studio smoke (or skip if obvious from code):** music fade now anchors to `min(endMs, outro end)` with 1s default (was: `endMs ?? totalFrames`) — for roost reels the outro ends at `totalDurationMs`, so behavior is identical; text overlays now render via core's `TrackTextOverlay` with identical props.

- [ ] **Step 4: Commit**

```bash
git add templates/roost-reels/src/LayeredRoostReel.tsx
git commit -m "refactor(roost): LayeredRoostReel → LayeredReelComposition wrapper (gains audio track + shared envelope)"
```

### Task B3: Submodule pin bump (ROOST repo)

- [ ] **Step 1:** The submodule checkout already sits on the Phase A merge commit. From the parent repo: `git add toolkit && git commit -m "chore: bump toolkit → core <shortSHA> (LayeredReelComposition + fades)"` — fold this into the same commit series as B1/B2 (pin + template must land together for CI/tsc coherence; if B1/B2 already committed, this is its own commit immediately after).

### Task B4: End-to-end smoke in the editor

- [ ] **Step 1:** From an existing roost project (e.g. `projects/<latest>`), launch `/toolkit:cut-tune`'s Studio/editor path (or `npm run studio`) and verify: reel renders; music lane shows the envelope; music inspector shows Fade in/out; adding an audio item (or a project with voice) plays it. Any visual diff vs pre-migration = stop and fix before Phase C.
- [ ] **Step 2:** Report result to the user (in Czech) with what changed for them: roost umí voice track, fady editovatelné v editoru.

---

## Phase C — campaign-reels migration (PP repo)

Run from `/Users/xaralis/Workspace/progpce/video-toolkit`. First: `cd toolkit && git fetch origin && git checkout <Phase-A-main-SHA> && cd .. ` (pin bump commit at the end, same rule as B3). The code below moves logic out of `templates/campaign-reels/src/LayeredCampaignReel.tsx` (476 lines) — the helper functions `extractEffects`, `resolveAudioSource`, `titleOverlaySpec`, `boundTranscript` (retargeted to take `boundAudio` instead of `reel`), and `renderVideoItem`'s per-kind bodies move to new files; render bodies (`FootageSegment` etc.) stay untouched.

### Task C1: Video-item renderers from renderVideoItem

**Files:**
- Create: `templates/campaign-reels/src/config/video-item-renderers.tsx`
- Reference: `templates/campaign-reels/src/LayeredCampaignReel.tsx:53-305`

**Interfaces:**
- Produces: `ClipItem`, `BrollItem`, `MultiClipItem`, `PhotoItem`, `CardItem`, `OutroItem` — all `VideoRenderer` (props `{ item, handles, config, anchoredOverlays, boundAudio }`).

- [ ] **Step 1:** Move `extractEffects`, `titleOverlaySpec`, and `boundTranscript` into the new file. Retarget the reel-wide lookups to the core-supplied context:
  - `findTitleOverlay(reel, videoId)` → `const titleOverlay = anchoredOverlays?.find((o) => (o.content as Record<string, unknown>).kind === 'title')`
  - `findAudioItem(reel, videoId)` → the `boundAudio` prop
  - `boundTranscript(item, reel, off)` → `boundTranscript(item, boundAudio, off)` (same body, `audioItem` parameter instead of the lookup)
- [ ] **Step 2:** Each `case` of `renderVideoItem` becomes one exported component with the identical body (including `frameOffsetSec = handles.inHalf / fps`, trims, `audioMode: 'silent'`, `recordings/`/`broll/` media prefixes). `fps` comes from `useVideoConfig()` inside each component (registered composition fps is the same `fps` constant from `config/reel-config` — identical values).
- [ ] **Step 3:** `npx tsc --noEmit` in the template → clean. Commit: `refactor(campaign): renderVideoItem cases → theming VideoRenderers`.

### Task C2: Composition theme + wrapper

**Files:**
- Create: `templates/campaign-reels/src/config/composition-theme.tsx`
- Modify: `templates/campaign-reels/src/LayeredCampaignReel.tsx` (→ thin wrapper, keep export names)
- Reference: `LayeredCampaignReel.tsx:307-476` (renderOverlayItem, chevron, brand mount)

**Interfaces:**
- Consumes: C1 renderers, core `CompositionTheme`.
- Produces: `compositionTheme: CompositionTheme` with:
  - `background: '#0a0a0a'`
  - `video`: all six kinds registered (C1 components)
  - `overlayItems`: `title: { routing: 'anchored' }`; `chevron: { routing: 'singleton', render: (item) => <ChevronMarker label={(item.content as { text?: string }).text ?? ''} /> }`; `'stat-callout'` / `'source-tag'` / `'update-badge'` / `'party-logos'`: `{ render }` wrapping the existing overlay components with the exact prop mapping from `renderOverlayItem` (appearAt 0, durationMs = span); text/quote-pull: no entry (core adapter + existing `overlays.text` registration)
  - `renderBrandTrack`: `<CampaignBrandTrack items={items} />` — a component mounting `PersistentOverlay` once in a `Sequence` spanning `max(endMs)` (moved from lines 454-473)
  - `resolveAudioSource`: the existing `resolveAudioSource` (moved verbatim — identical to the core default; keep the explicit override so campaign is immune to future core-default drift)

- [ ] **Step 1:** Write the theme; rewrite `LayeredCampaignReel.tsx` as the wrapper (mirror of B2, keeping `loadBrandFonts()` and any other module-level side effects/exports the old file had — check `Root.tsx` imports first).
- [ ] **Step 2:** `npx tsc --noEmit` + `npm test` in the template → clean. Commit: `refactor(campaign): LayeredCampaignReel → LayeredReelComposition wrapper`.

### Task C3: Parity verification + pin bump

- [ ] **Step 1:** Pick the most recent campaign project with a full config. BEFORE the pin bump lands in that project's context, render 5 sampled stills from the template with that project's config (`npx remotion still src/index.ts <CompId> out/parity-pre-<f>.png --frame=<f> --props=<config>` for f ∈ {0, 25%, 50%, 75%, last-10}); repeat AFTER migration as `parity-post-<f>.png`.
- [ ] **Step 2:** `magick compare -metric RMSE parity-pre-<f>.png parity-post-<f>.png null:` for each — accept < 1% RMSE (font antialiasing noise); anything above = investigate before proceeding.
- [ ] **Step 3:** Commit pin bump + migration to the PP repo; report to the user.

---

## Self-review (done at write time)

- **Spec coverage:** component (A6), theme contract (A5), audio track (A3+A4), fades-as-data schema+envelope+editor (A1, A2, A7), roost migration (B1–B4), campaign migration (C1–C3), music/audio unification deferred ✓. Spec's "derivation defaults fadeOutMs to 1000" is implemented as the envelope-side default (`?? 1000`) — same observable behavior, zero derivation churn.
- **Type consistency:** `CompositionTheme` fields used in B1/C2 match A5 exactly; `buildAudioNodes(items, { fps, resolveSource })` consistent A4→A6; `roostReelDurationInFrames` kept in B2 for `Root.tsx`.
- **Placeholder scan:** none — every code step carries the actual code; C1/C2 move-tasks name exact sources (file:line) and the exact retargeting rules.
