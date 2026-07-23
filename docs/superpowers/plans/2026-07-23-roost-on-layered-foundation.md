# Roost on the Layered Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the roost-reels beat-montage template onto the shared `LayeredReel` foundation — a core montage derivation, per-clip vintage, ruler beat-guides, inspector effect add/remove, a shared at-cut transition engine, and a thin `LayeredRoostReel` renderer — then migrate `roost-reel-01`.

**Architecture:** Beats compile to absolute ms at derivation time and survive only as `meta.guidesMs` ruler markers. Core gains two optional schema fields, `deriveMontageLayered`, a ruler-guides timeline prop, inspector effect add/remove, and an extracted at-cut transition engine that both `LayeredCampaignReel` and the new `LayeredRoostReel` consume. Roost is the thin brand adapter mapping `VideoItem.kind` → its own components.

**Tech Stack:** TypeScript, Zod, React, Remotion 4.0.425, Vitest, `@xzdarcy/react-timeline-editor`. Node 20+ (`~/.nvm/versions/node/v20*/bin` on PATH for all npm/vitest/tsc). Core tests run from `core/lib/editor` via `npx vitest`.

## Global Constraints

- Commits are **unsigned** in every repo this plan touches (`git commit --no-gpg-sign`). No `Co-Authored-By`.
- **Core `/cut` and every other core command stays unmodified.** Roost's vintage-by-default is a brand-rules instruction only.
- Schema additions are **optional** — campaign-reels output must stay byte-unchanged (the 13 migrated projects render identically). Verify Phase-B parity by render.
- The `LayeredReel` is the source of truth after migration; the roost config → LayeredReel migration is one-way (git is the undo).
- No new transition kinds, overlay kinds, or effects beyond `cut`/`fade`, `teaser`, direction `ken-burns`, `vintage`.
- Beat→ms conversion (single definition): `fpb = round(fps·60/bpm)`; a beat index `b` → frame `b·fpb` → ms `round(b·fpb·1000/fps)`.
- Vintage is a per-clip effect `{type:'vintage', mode:'film'|'vhs'}` on footage items (photo/broll), never a reel-wide field.
- Roost timing constants (frames @ 30fps), shared by derivation and renderer: `TRANSITION_FRAMES=15`, `LOGO_REVEAL_FRAMES=48`, `LOGO_HOLD_FRAMES=60`.
- The submodule pointer in brand repos is **not committed** (kept locally checked out); after any core commit a brand repo consumes, re-sync its `toolkit/` via local fetch + detached checkout.

## Reference files (read before starting a phase)

- Spec: `docs/superpowers/specs/2026-07-23-roost-on-layered-foundation-design.md`
- Core schema: `lib/reel-config-base/layered-schema.ts`
- Existing derivation to mirror: `lib/reel-config-base/derive-layered.ts` + tests `lib/editor/src/derive-layered.test.ts`
- Campaign renderer (source of the at-cut engine): `../video-toolkit/templates/campaign-reels/src/LayeredCampaignReel.tsx`
- Timeline: `lib/editor/app/LayeredTimeline.tsx`; Inspector: `lib/editor/app/LayeredInspector.tsx`
- Roost model: `/Users/xaralis/Workspace/roost/video-toolkit/templates/roost-reels/src/` (`RoostReel.tsx`, `segments/BeatMontage.tsx`, `segments/MontageClip.tsx`, `segments/KenBurnsPhoto.tsx`, `overlays/TeaserOverlay.tsx`, `outro/Outro.tsx`, `overlays/Watermark.tsx`, `effects/VintageOverlay.tsx`, `backgrounds/PaperBackground.tsx`, `config/schema.ts`)

---

## PHASE A — Core foundation (no renderer change)

### Task 1: Schema — `props` bag + `meta.guidesMs`

**Files:**
- Modify: `lib/reel-config-base/layered-schema.ts`
- Test: `lib/editor/src/layered-schema.test.ts`

**Interfaces:**
- Produces: `VideoContainerBase.props?: Record<string, unknown>` on every video item; `LayeredReel['meta'].guidesMs?: number[]`.

- [ ] **Step 1: Write the failing test** — append to `lib/editor/src/layered-schema.test.ts`:

```ts
it('accepts an optional per-item props bag and meta.guidesMs', () => {
  const reel = {
    version: 'layered-1',
    meta: { topic: 'x', totalDurationMs: 1000, guidesMs: [0, 500, 1000] },
    tracks: {
      video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 1000, source: 'a.jpg',
                props: { displayMode: 'paper-frame' }, musicBoostDb: 0 }],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };
  const parsed = LayeredReelSchema.parse(reel);
  expect(parsed.meta.guidesMs).toEqual([0, 500, 1000]);
  expect((parsed.tracks.video[0] as { props?: Record<string, unknown> }).props).toEqual({ displayMode: 'paper-frame' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd lib/editor && npx vitest run src/layered-schema.test.ts -t "props bag"`
Expected: FAIL (`guidesMs`/`props` stripped or rejected).

- [ ] **Step 3: Implement** — in `layered-schema.ts`, add `props` to `VideoContainerBase` (after `transitionIn`):

```ts
  transitionIn: z.record(z.string(), z.unknown()).optional(),
  // Per-item brand render-hint bag (e.g. roost displayMode; outro style/variant).
  // Generic escape hatch — mirrors BrandLayerItemSchema.props.
  props: z.record(z.string(), z.unknown()).optional(),
```

And add `guidesMs` to the `meta` object:

```ts
  meta: z.object({ topic: z.string(), totalDurationMs: Ms, guidesMs: z.array(Ms).optional() }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd lib/editor && npx vitest run src/layered-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/reel-config-base/layered-schema.ts lib/editor/src/layered-schema.test.ts
git commit --no-gpg-sign -m "feat(layered): optional per-item props bag + meta.guidesMs"
```

---

### Task 2: `deriveMontageLayered` — roost config → LayeredReel

**Files:**
- Create: `lib/reel-config-base/derive-montage.ts`
- Test: `lib/editor/src/derive-montage.test.ts`

**Interfaces:**
- Consumes: `LayeredReel`, `VideoItem`, `OverlayItem`, `BrandLayerItem` types from `./layered-schema`; `LayeredReelSchema` for the test.
- Produces: `deriveMontageLayered(cfg: MontageConfig, opts?: MontageOpts): LayeredReel` and the structural input types `MontageConfig`, `MontageSegment`.

- [ ] **Step 1: Write the failing test** — `lib/editor/src/derive-montage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveMontageLayered } from '@video-toolkit/lib/reel-config-base/derive-montage';
import { LayeredReelSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

const CFG = {
  fps: 30, bpm: 76.015, track: 'audio/boj.wav', vintage: 'film' as const,
  kicks: '0.4587,1.3973,1.952',
  segments: [
    { src: 'media/p1.jpg', type: 'photo' as const, displayMode: 'full-bleed' as const,
      beatStart: 0, beatCount: 3, transition: 'cut' as const, kenBurns: { direction: 'in' as const } },
    { src: 'media/v1.mp4', type: 'video' as const, displayMode: 'paper-frame' as const,
      beatStart: 3, beatCount: 3, transition: 'fade' as const, inPointSec: 2 },
  ],
  teaser: { lines: ['A', 'B'], appearAtSec: 0, reveal: 'line' as const, fontSize: 96 },
  outro: { style: 'organic' as const, variant: 'sand-brown' as const, transition: 'dissolve' as const,
           logoDelaySec: 0.5, beatStart: 6 },
  watermark: { asset: 'brand/mark.png', corner: 'top-right' as const, variant: 'black' as const },
};

describe('deriveMontageLayered', () => {
  it('derives a valid LayeredReel with beat→ms items, per-clip vintage, teaser, outro, watermark, guides', () => {
    const reel = deriveMontageLayered(CFG);
    expect(() => LayeredReelSchema.parse(reel)).not.toThrow();

    const fpb = Math.round((30 * 60) / 76.015); // 24
    const beatMs = (b: number) => Math.round((b * fpb * 1000) / 30);

    // photo item
    const p = reel.tracks.video.find((v) => v.kind === 'photo')!;
    expect(p).toMatchObject({ source: 'media/p1.jpg', startMs: beatMs(0), endMs: beatMs(3) });
    expect((p as { props?: { displayMode?: string } }).props?.displayMode).toBe('full-bleed');
    expect(p.effects?.some((e) => e.type === 'ken-burns' && (e as { direction?: string }).direction === 'in')).toBe(true);
    expect(p.effects?.some((e) => e.type === 'vintage' && (e as { mode?: string }).mode === 'film')).toBe(true);

    // video item → broll, muted convention (no audio track items at all)
    const b = reel.tracks.video.find((v) => v.kind === 'broll')!;
    expect(b).toMatchObject({ source: 'media/v1.mp4', startMs: beatMs(3), endMs: beatMs(6), sourceInMs: 2000 });
    expect(b.sourceOutMs).toBe(2000 + (beatMs(6) - beatMs(3)));
    expect((b as { transitionIn?: { kind?: string } }).transitionIn?.kind).toBe('fade');
    expect(b.effects?.some((e) => e.type === 'vintage')).toBe(true);
    expect(reel.tracks.audio).toHaveLength(0);

    // teaser overlay
    const teaser = reel.tracks.overlays.find((o) => o.content.kind === 'teaser')!;
    expect(teaser.content).toMatchObject({ kind: 'teaser', lines: ['A', 'B'], reveal: 'line', fontSize: 96 });

    // outro item + props; reel length = last item end
    const outro = reel.tracks.video.find((v) => v.kind === 'outro')!;
    expect((outro as { props?: { style?: string } }).props?.style).toBe('organic');
    expect(outro.endMs).toBe(reel.meta.totalDurationMs);

    // watermark hides before the outro
    const wm = reel.tracks.brand.find((x) => x.kind === 'watermark')!;
    expect(wm.startMs).toBe(0);
    expect(wm.endMs).toBe(outro.startMs);

    // guides from kicks (seconds → ms)
    expect(reel.meta.guidesMs).toEqual([459, 1397, 1952]);
  });

  it('omits vintage effects when cfg.vintage is null', () => {
    const reel = deriveMontageLayered({ ...CFG, vintage: null });
    const footage = reel.tracks.video.filter((v) => v.kind === 'photo' || v.kind === 'broll');
    expect(footage.every((v) => !v.effects?.some((e) => e.type === 'vintage'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd lib/editor && npx vitest run src/derive-montage.test.ts`
Expected: FAIL (`Cannot find module '.../derive-montage'`).

- [ ] **Step 3: Implement** — create `lib/reel-config-base/derive-montage.ts`:

```ts
// deriveMontageLayered — the roost beat-montage compiler: reshapes a
// beat-synced montage config (photo/video segments placed on musical beats)
// into the track-native LayeredReel model. Beats are consumed here (beat → ms)
// and survive only as meta.guidesMs ruler markers — see the layered spec.
// Sibling to deriveLayered (different input shape, same output).
import type { LayeredReel, VideoItem, OverlayItem, BrandLayerItem, Effect } from './layered-schema';

export interface MontageSegment {
  src: string;
  type: 'photo' | 'video';
  displayMode: 'full-bleed' | 'paper-frame';
  beatStart: number;
  beatCount: number;
  transition?: 'cut' | 'fade';
  inPointSec?: number;
  kenBurns?: { direction: 'in' | 'left' | 'up' };
}

export interface MontageConfig {
  fps: number;
  bpm: number;
  track: string;
  vintage?: 'film' | 'vhs' | null;
  kicks?: string;
  segments: MontageSegment[];
  teaser?: { lines: string[]; appearAtSec: number; reveal?: 'line' | 'all'; fontSize?: number } | null;
  outro: {
    style: string; variant: string; transition: string; logoDelaySec?: number; beatStart: number;
  };
  watermark: { asset: string; corner: string; variant?: string };
}

export interface MontageOpts {
  transitionFrames?: number; // outro enter crossfade
  logoRevealFrames?: number;
  logoHoldFrames?: number;
}

// Teaser on-screen frames (reveal → hold → fade), mirrored from roost's
// TeaserOverlay.teaserDurationInFrames so the derived overlay span matches.
const LINE_STAGGER_SEC = 0.35;
const TEASER_HOLD_SEC = 4.5;
const TEASER_FADE_SEC = 0.6;
function teaserFrames(numLines: number, reveal: 'line' | 'all', fps: number): number {
  const stagger = reveal === 'line' ? Math.round(LINE_STAGGER_SEC * fps) : 0;
  const lastLineStart = Math.max(0, numLines - 1) * stagger;
  return lastLineStart + Math.round(TEASER_HOLD_SEC * fps) + Math.round(TEASER_FADE_SEC * fps);
}

export function deriveMontageLayered(cfg: MontageConfig, opts: MontageOpts = {}): LayeredReel {
  const fps = cfg.fps;
  const transitionFrames = opts.transitionFrames ?? 15;
  const logoRevealFrames = opts.logoRevealFrames ?? 48;
  const logoHoldFrames = opts.logoHoldFrames ?? 60;

  const fpb = Math.round((fps * 60) / cfg.bpm);
  const framesToMs = (f: number) => Math.round((f * 1000) / fps);
  const beatToMs = (b: number) => framesToMs(b * fpb);

  const vintageEffect: Effect[] = cfg.vintage ? [{ type: 'vintage', mode: cfg.vintage }] : [];

  const video: VideoItem[] = [];
  cfg.segments.forEach((s, i) => {
    const startMs = beatToMs(s.beatStart);
    const endMs = beatToMs(s.beatStart + s.beatCount);
    const id = `seg-${String(i + 1).padStart(3, '0')}`;
    const transitionIn = s.transition === 'fade' ? { transitionIn: { kind: 'fade', frames: 6 } } : {};
    if (s.type === 'photo') {
      const effects: Effect[] = [
        ...(s.kenBurns ? [{ type: 'ken-burns', direction: s.kenBurns.direction } as Effect] : []),
        ...vintageEffect,
      ];
      video.push({
        id, kind: 'photo', startMs, endMs, source: s.src,
        props: { displayMode: s.displayMode }, ...transitionIn,
        ...(effects.length ? { effects } : {}), musicBoostDb: 0,
      });
    } else {
      const sourceInMs = Math.round((s.inPointSec ?? 0) * 1000);
      video.push({
        id, kind: 'broll', startMs, endMs, source: s.src,
        sourceInMs, sourceOutMs: sourceInMs + (endMs - startMs),
        props: { displayMode: s.displayMode }, ...transitionIn,
        ...(vintageEffect.length ? { effects: [...vintageEffect] } : {}), musicBoostDb: 0,
      });
    }
  });

  // Reel length (frames, to match RoostReel.reelDurationInFrames exactly), then → ms.
  const lastSeg = cfg.segments[cfg.segments.length - 1];
  const contentEndF = lastSeg ? (lastSeg.beatStart + lastSeg.beatCount) * fpb : 0;
  const outroFromF = cfg.outro.beatStart * fpb;
  const outroEnterF = Math.min(contentEndF, outroFromF);
  const atStart = outroEnterF <= 0;
  const transF = atStart ? 0 : transitionFrames;
  const transitionStartF = Math.max(0, outroEnterF - transF);
  const logoDelayF = Math.round((cfg.outro.logoDelaySec ?? 0.5) * fps);
  const totalF = transitionStartF + logoDelayF + logoRevealFrames + logoHoldFrames;

  const transitionStartMs = framesToMs(transitionStartF);
  const totalMs = framesToMs(totalF);

  // kicks (seconds) → reel-global frames (audio plays from 0) for the heartbeat outro.
  const kickFrames = (cfg.kicks ?? '')
    .split(',').map((s) => parseFloat(s.trim())).filter((n) => Number.isFinite(n))
    .map((s) => Math.round(s * fps));

  video.push({
    id: 'outro', kind: 'outro', startMs: transitionStartMs, endMs: totalMs,
    props: {
      style: cfg.outro.style, variant: cfg.outro.variant, transition: cfg.outro.transition,
      logoDelaySec: cfg.outro.logoDelaySec ?? 0.5, framesPerBeat: fpb, kickFrames,
    },
    musicBoostDb: 0,
  });

  const overlays: OverlayItem[] = [];
  if (cfg.teaser?.lines?.length) {
    const startMs = Math.round((cfg.teaser.appearAtSec ?? 0) * 1000);
    const durF = teaserFrames(cfg.teaser.lines.length, cfg.teaser.reveal ?? 'line', fps);
    overlays.push({
      id: 'teaser', startMs, endMs: startMs + framesToMs(durF),
      content: { kind: 'teaser', lines: cfg.teaser.lines, reveal: cfg.teaser.reveal ?? 'line', fontSize: cfg.teaser.fontSize ?? 96 },
    });
  }

  const brand: BrandLayerItem[] = [{
    id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: transitionStartMs,
    props: { asset: cfg.watermark.asset, corner: cfg.watermark.corner, variant: cfg.watermark.variant ?? 'black' },
  }];

  // guides: kick onsets if present, else the uniform beat grid up to the reel end.
  const guidesMs = kickFrames.length
    ? kickFrames.map((f) => framesToMs(f))
    : Array.from({ length: Math.ceil(totalF / fpb) + 1 }, (_, k) => framesToMs(k * fpb));

  return {
    version: 'layered-1',
    meta: { topic: 'Roost reel', totalDurationMs: totalMs, guidesMs },
    tracks: {
      video, audio: [], music: { source: cfg.track, baseVolumeDb: -8 }, overlays, brand,
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd lib/editor && npx vitest run src/derive-montage.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add lib/reel-config-base/derive-montage.ts lib/editor/src/derive-montage.test.ts
git commit --no-gpg-sign -m "feat(layered): deriveMontageLayered — roost beat-montage → LayeredReel"
```

---

### Task 3: Timeline ruler beat-guides

**Files:**
- Modify: `lib/editor/app/LayeredTimeline.tsx` (add `guidesMs?: number[]` to `LayeredTimelineProps`; render a guides overlay over the track area)
- Test: `lib/editor/app/LayeredTimeline.test.tsx` (create if absent; a focused render test)

**Interfaces:**
- Consumes: `scaleWidth` (px/s), `startLeft = 12` (matches the `<Timeline startLeft={12}>`).
- Produces: `LayeredTimelineProps.guidesMs?: number[]`.

- [ ] **Step 1: Write the failing test** — `lib/editor/app/LayeredTimeline.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LayeredTimeline } from './LayeredTimeline';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const reel: LayeredReel = {
  version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
  tracks: { video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0 }],
            audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [] },
};

describe('LayeredTimeline beat guides', () => {
  it('renders one guide tick per guidesMs entry at startLeft + ms/1000*scaleWidth px', () => {
    const { container } = render(
      <LayeredTimeline reel={reel} selectedId={null} onSelect={() => {}}
        playerRef={{ current: null }} fps={30} scaleWidth={80} guidesMs={[0, 1000]} />,
    );
    const ticks = container.querySelectorAll('[data-guide-tick]');
    expect(ticks).toHaveLength(2);
    expect((ticks[1] as HTMLElement).style.left).toBe('92px'); // 12 + 1000/1000*80
  });

  it('renders no ticks when guidesMs is absent', () => {
    const { container } = render(
      <LayeredTimeline reel={reel} selectedId={null} onSelect={() => {}}
        playerRef={{ current: null }} fps={30} scaleWidth={80} />,
    );
    expect(container.querySelectorAll('[data-guide-tick]')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd lib/editor && npx vitest run app/LayeredTimeline.test.tsx`
Expected: FAIL (no `data-guide-tick` nodes; `guidesMs` not a prop).

- [ ] **Step 3: Implement** — in `LayeredTimeline.tsx`:

Add to `LayeredTimelineProps`:

```ts
  guidesMs?: number[]; // vertical ruler guide markers (e.g. roost beat onsets)
```

Destructure it in the component signature (alongside `scaleWidth = 80`): add `guidesMs,`.

Wrap the `<Timeline .../>` in a relatively-positioned container and add the overlay. Replace the timeline wrapper div (the `<div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>` that contains `<Timeline>`) so it reads:

```tsx
      <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', position: 'relative' }}>
        {guidesMs && guidesMs.length > 0 && (
          <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
            {guidesMs.map((ms, i) => (
              <div
                key={i}
                data-guide-tick
                style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: 12 + (ms / 1000) * scaleWidth, // 12 = <Timeline startLeft>
                  width: 1, background: 'rgba(182,255,90,0.35)',
                }}
              />
            ))}
          </div>
        )}
        <Timeline
          ref={stateRef}
          /* …existing props unchanged… */
        />
      </div>
```

Note: the overlay does not scroll-follow horizontally in this minimal version — acceptable because the roost reel fits the view at default zoom; a scroll-synced transform is a possible later refinement, out of scope here.

- [ ] **Step 4: Run to verify it passes**

Run: `cd lib/editor && npx vitest run app/LayeredTimeline.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/editor/app/LayeredTimeline.tsx lib/editor/app/LayeredTimeline.test.tsx
git commit --no-gpg-sign -m "feat(editor): timeline ruler beat-guides (guidesMs prop)"
```

---

### Task 4: Inspector — add/remove clip effects

**Files:**
- Modify: `lib/editor/app/LayeredInspector.tsx`
- Test: `lib/editor/app/LayeredInspector.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `patchItem('video', id, patch)` (exists), `EffectEditor` (exists), `v.effects` array on a video item.
- Produces: an "Add effect" control + per-effect remove that mutate `v.effects` (creating it when absent) and persist via `onChange`.

Default new-effect params (used by the Add picker):

```ts
const EFFECT_DEFAULTS: Record<string, Record<string, unknown>> = {
  vintage: { type: 'vintage', mode: 'film' },
  'ken-burns': { type: 'ken-burns', fromScale: 1, toScale: 1.08, fromX: 0.5, toX: 0.5 },
};
```

- [ ] **Step 1: Write the failing test** — `lib/editor/app/LayeredInspector.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { LayeredInspector } from './LayeredInspector';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const base: LayeredReel = {
  version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0,
              effects: [{ type: 'vintage', mode: 'film' }] }],
    audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
  },
};

describe('LayeredInspector effect add/remove', () => {
  it('adds a ken-burns effect to a clip that has none of it', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <LayeredInspector reel={base} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(getByText('+ Add effect'));
    fireEvent.click(getByText('ken-burns'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].effects).toHaveLength(2);
    expect(next.tracks.video[0].effects!.some((e) => e.type === 'ken-burns')).toBe(true);
  });

  it('removes an existing effect', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <LayeredInspector reel={base} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(getByLabelText('remove effect vintage'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].effects ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd lib/editor && npx vitest run app/LayeredInspector.test.tsx`
Expected: FAIL (no Add effect control / remove control).

- [ ] **Step 3: Implement** — in `LayeredInspector.tsx`:

Add the defaults const near the top-level consts (after `readonlyValue`):

```ts
const EFFECT_DEFAULTS: Record<string, Record<string, unknown>> = {
  vintage: { type: 'vintage', mode: 'film' },
  'ken-burns': { type: 'ken-burns', fromScale: 1, toScale: 1.08, fromX: 0.5, toX: 0.5 },
};
```

Give `EffectEditor` an optional `onRemove` and render a remove button in its header. Change its signature and the `type` header lines:

```tsx
function EffectEditor({ eff, onPatch, onRemove }: { eff: Record<string, unknown>; onPatch: (patch: Record<string, unknown>) => void; onRemove?: () => void }) {
  const type = eff.type as string;
  const num = (k: string) => (typeof eff[k] === 'number' ? (eff[k] as number) : undefined);
  const header = (
    <div style={{ ...section, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>Effect · {type}</span>
      {onRemove && (
        <button type="button" aria-label={`remove effect ${type}`} onClick={onRemove}
          style={{ background: 'none', border: 'none', color: '#9a9da5', cursor: 'pointer', fontSize: 13 }}>✕</button>
      )}
    </div>
  );
  if (type === 'ken-burns') {
    return (<>{header}<Row>{/* …existing From X / To X … */}</Row><Row>{/* …existing scales… */}</Row></>);
  }
  if (type === 'blend') {
    return (<>{header}{/* …existing blend fields… */}</>);
  }
  if (type === 'vintage') {
    return (<>{header}
      <SelectField lbl="Mode" value={eff.mode as string | undefined}
        options={[{ value: 'film', label: 'film' }, { value: 'vhs', label: 'vhs' }]}
        onChange={(s) => onPatch({ mode: s })} />
    </>);
  }
  return header;
}
```

(Keep the existing ken-burns/blend field bodies verbatim — only the `<div style={section}>Effect · …</div>` line is replaced by `{header}`, and the `vintage` branch is new.)

In the `lane === 'video'` panel, replace the effects `.map(...)` block with a version that passes `onRemove`, then add the "Add effect" control right after it:

```tsx
        {v.effects &&
          v.effects.map((eff, i) => (
            <EffectEditor
              key={i}
              eff={eff as Record<string, unknown>}
              onPatch={(patch) =>
                patchItem('video', id, { effects: v.effects!.map((e, j) => (j === i ? { ...(e as Record<string, unknown>), ...patch } : e)) })
              }
              onRemove={() => patchItem('video', id, { effects: v.effects!.filter((_, j) => j !== i) })}
            />
          ))}
        <AddEffectControl
          onAdd={(kind) => patchItem('video', id, { effects: [...(v.effects ?? []), EFFECT_DEFAULTS[kind]] })}
        />
```

Add the `AddEffectControl` component (a tiny picker) above `export function LayeredInspector`:

```tsx
function AddEffectControl({ onAdd }: { onAdd: (kind: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ ...seekBtn, marginBottom: 4 }}>+ Add effect</button>
      {open &&
        Object.keys(EFFECT_DEFAULTS).map((k) => (
          <button key={k} type="button" onClick={() => { onAdd(k); setOpen(false); }}
            style={{ ...linkBtn }}>{k}</button>
        ))}
    </div>
  );
}
```

(`useState` is already imported; `seekBtn`/`linkBtn` already exist.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd lib/editor && npx vitest run app/LayeredInspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the whole core suite (guard against regressions)**

Run: `cd lib/editor && npx vitest run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add lib/editor/app/LayeredInspector.tsx lib/editor/app/LayeredInspector.test.tsx
git commit --no-gpg-sign -m "feat(editor): inspector add/remove clip effects (incl. vintage mode)"
```

---

## PHASE B — Extract the shared at-cut transition engine

> Phase B works in the **brand repo** `../video-toolkit` (where `LayeredCampaignReel` lives) and in **core** (where the engine moves to). After the core commit, re-sync the submodule (see Task 6). Node PATH note applies.

### Task 5: Extract the at-cut engine into core `lib/render/`

**Files:**
- Create: `lib/render/at-cut-transitions.tsx` (core)
- Create: `lib/render/README.md` (one paragraph: what this module is)
- Reference (do not yet edit): `../video-toolkit/templates/campaign-reels/src/LayeredCampaignReel.tsx`

**Interfaces:**
- Produces (exact exports, lifted verbatim from `LayeredCampaignReel.tsx`):
  - `type TransitionRecord`
  - `getTransitionRecord(raw: Record<string, unknown> | undefined): TransitionRecord | undefined`
  - `type AnyPresentation`
  - `presentationFor(t: TransitionRecord | undefined, dims: { width: number; height: number }): AnyPresentation | null`
  - `TransitionLayer` (React.FC)
  - `AtCutTransition` (React.FC)
- Note: `presentationFor` currently closes over module-level `width`/`height` (from `./config/reel-config`). In the extracted version it takes `dims` explicitly so core stays project-agnostic.

- [ ] **Step 1: Read the source ranges.** In `LayeredCampaignReel.tsx`, identify the blocks defining `TransitionRecord`, `getTransitionRecord`, `AnyPresentation`, `DIRECTION_4WAY`, `presentationFor`, `TransitionLayer`, and `AtCutTransition` (search those identifiers). These are brand-agnostic except `presentationFor`'s `width`/`height` closure and its imports of the transition presentations.

- [ ] **Step 2: Create `lib/render/at-cut-transitions.tsx`** with those blocks moved verbatim, with two changes: (a) `presentationFor` gains a `dims: { width: number; height: number }` param and uses `dims.width`/`dims.height` for `clockWipe`/`iris`; (b) imports the transition presentations from core paths:

```tsx
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { flip } from '@remotion/transitions/flip';
import { clockWipe } from '@remotion/transitions/clock-wipe';
import { iris } from '@remotion/transitions/iris';
import { glitch, whipPan, zoomThrough, wipe as customWipe, gradientWipe } from '../transitions';
import { useCurrentFrame } from 'remotion';
// …then the verbatim TransitionRecord / getTransitionRecord / AnyPresentation /
//   DIRECTION_4WAY / presentationFor(dims) / TransitionLayer / AtCutTransition …
```

- [ ] **Step 3: Add a co-located test** `lib/editor/src/at-cut-transitions.test.ts` (core tests live under `lib/editor`) asserting the pure `presentationFor` mapping — it needs no DOM:

```ts
import { describe, it, expect } from 'vitest';
import { presentationFor, getTransitionRecord } from '@video-toolkit/lib/render/at-cut-transitions';

describe('presentationFor', () => {
  const dims = { width: 1080, height: 1920 };
  it('maps cut/undefined to null and fade to a presentation', () => {
    expect(presentationFor(undefined, dims)).toBeNull();
    expect(getTransitionRecord({ kind: 'cut' })).toBeUndefined();
    expect(presentationFor(getTransitionRecord({ kind: 'fade', frames: 12 }), dims)).not.toBeNull();
  });
  it('maps every known kind to a non-null presentation', () => {
    for (const kind of ['fade','dissolve','fade-coal','slide','flip','clock-wipe','iris','wipe','glitch','whip-pan','zoom-through','gradient-wipe']) {
      expect(presentationFor(getTransitionRecord({ kind }), dims)).not.toBeNull();
    }
    expect(presentationFor(getTransitionRecord({ kind: 'nope' }), dims)).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `cd lib/editor && npx vitest run src/at-cut-transitions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (core)**

```bash
git add lib/render/at-cut-transitions.tsx lib/render/README.md lib/editor/src/at-cut-transitions.test.ts
git commit --no-gpg-sign -m "feat(render): extract shared at-cut transition engine to core lib/render"
```

---

### Task 6: Re-express `LayeredCampaignReel` on the extracted engine + parity

**Files:**
- Modify: `../video-toolkit/templates/campaign-reels/src/LayeredCampaignReel.tsx`
- Modify: `../video-toolkit/toolkit` (submodule pointer — local checkout only, NOT committed)

**Interfaces:**
- Consumes: the Task-5 exports from `@video-toolkit/lib/render/at-cut-transitions`.

- [ ] **Step 1: Re-sync the submodule to the Task-5 core commit** (from `../video-toolkit/toolkit`):

```bash
cd ../video-toolkit/toolkit
git fetch --no-tags /Users/xaralis/Workspace/progpce/core feat/reel-editor-skeleton
git checkout -f --detach "$(git -C /Users/xaralis/Workspace/progpce/core rev-parse HEAD)"
```

- [ ] **Step 2: Edit `LayeredCampaignReel.tsx`** — delete the now-duplicated in-file `TransitionRecord`, `getTransitionRecord`, `AnyPresentation`, `DIRECTION_4WAY`, `presentationFor`, `TransitionLayer`, `AtCutTransition` definitions, and import them instead:

```tsx
import { getTransitionRecord, presentationFor, AtCutTransition } from '@video-toolkit/lib/render/at-cut-transitions';
```

Update the two `presentationFor(inRecord)` / `presentationFor(outRecord)` call sites in the `videoNodes` map to pass dims: `presentationFor(inRecord, { width, height })` (both `width`/`height` are already imported from `./config/reel-config`). Leave `renderVideoItem`, overlays, audio, brand, music untouched.

- [ ] **Step 3: Typecheck-free smoke via render (parity).** Render a short range for two campaign projects that exercise transitions and audio, and confirm both succeed:

```bash
cd ../video-toolkit/projects/pp-namesti-republiky
npx remotion render src/index.ts LayeredCampaignReel /tmp/parity-namesti.mp4 --frames=0-30 --scale=0.5
cd ../pp-05-zastupitelsky-klub
npx remotion render src/index.ts LayeredCampaignReel /tmp/parity-pp05.mp4 --frames=0-30 --scale=0.5
```

Expected: both render to completion (non-zero mp4). If a project's `.bin/remotion` is a broken copy (MODULE_NOT_FOUND `./dist/index`), relink: `ln -sf ../@remotion/cli/remotion-cli.js node_modules/.bin/remotion`.

- [ ] **Step 4: Visual parity check.** Render one still mid-transition from `pp-namesti-republiky` (seg-007 has a dissolve) before and conceptually compare to the pre-change output — confirm the dissolve still renders (not a hard cut):

```bash
cd ../video-toolkit/projects/pp-namesti-republiky
npx remotion still src/index.ts LayeredCampaignReel /tmp/parity-dissolve.png --frame=600 --scale=0.5
```

Expected: a rendered frame (inspect that it shows real content, not black).

- [ ] **Step 5: Commit (brand repo, unsigned; the submodule pointer stays unstaged)**

```bash
cd ../video-toolkit
git add templates/campaign-reels/src/LayeredCampaignReel.tsx
git commit --no-gpg-sign -m "refactor(template): LayeredCampaignReel consumes core at-cut engine"
```

---

## PHASE C — Roost renderer + integration

> Phase C works in the **roost repo** `/Users/xaralis/Workspace/roost/video-toolkit`. Its `toolkit/` submodule must first be bumped to current core (Task 7).

### Task 7: Bump roost's toolkit submodule + confirm layered lib is present

**Files:**
- Modify: `/Users/xaralis/Workspace/roost/video-toolkit/toolkit` (local checkout only)

- [ ] **Step 1: Bump the submodule** to the latest core commit (has photo, montage derivation, at-cut engine, schema fields):

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit/toolkit
git fetch --no-tags /Users/xaralis/Workspace/progpce/core feat/reel-editor-skeleton
git checkout -f --detach "$(git -C /Users/xaralis/Workspace/progpce/core rev-parse HEAD)"
```

- [ ] **Step 2: Confirm the montage derivation + engine resolve** from roost:

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit
ls toolkit/lib/reel-config-base/derive-montage.ts toolkit/lib/render/at-cut-transitions.tsx
```

Expected: both paths exist.

---

### Task 8: `LayeredRoostReel` renderer

**Files:**
- Create: `/Users/xaralis/Workspace/roost/video-toolkit/templates/roost-reels/src/LayeredRoostReel.tsx`
- Reference: `templates/roost-reels/src/RoostReel.tsx` (timing + layering source of truth), `segments/MontageClip.tsx`, `segments/KenBurnsPhoto.tsx`, `overlays/TeaserOverlay.tsx`, `outro/Outro.tsx`, `overlays/Watermark.tsx`, `effects/VintageOverlay.tsx`, `backgrounds/PaperBackground.tsx`; and `../video-toolkit/templates/campaign-reels/src/LayeredCampaignReel.tsx` for the assembly pattern.

**Interfaces:**
- Consumes: `LayeredReel`, `VideoItem` from `@video-toolkit/lib/reel-config-base/layered-schema`; `AtCutTransition`, `presentationFor`, `getTransitionRecord` from `@video-toolkit/lib/render/at-cut-transitions`; `computeMusicEnvelope` from `@video-toolkit/lib/reel-config-base/music-envelope` (optional — roost music is constant with an end fade, so a direct `volume(frame)` like `RoostReel` is acceptable).
- Produces: `export const LayeredRoostReel: React.FC<{ reel: LayeredReel }>` and `export const roostReelDurationInFrames = (reel: LayeredReel, fps: number) => number` (= `round(reel.meta.totalDurationMs/1000*fps)`).

**Component mapping (implement exactly this):**
- Video track assembly mirrors `LayeredCampaignReel`'s `videoNodes` (absolute Sequences + `AtCutTransition` with handle borrowing) — copy that structure, but `renderVideoItem` dispatches to roost components:
  - `kind:'photo'` → `KenBurnsPhoto` with `direction` from the item's `ken-burns` effect (default `'in'`), wrapped by `displayModeWrap(item.props?.displayMode, media)`.
  - `kind:'broll'` → `OffthreadVideo muted startFrom={round(sourceInMs/1000*fps)}` (cover style), wrapped by `displayModeWrap`.
  - `kind:'outro'` → roost `Outro`, props from `item.props` (`style`, `variant`, `transition`, `logoDelaySec`, `framesPerBeat`, `kickFrames`); compute `transitionFrames`/`logoDelayFrames`/`beatOffsetFrames` as `RoostReel` does (use `LOGO_REVEAL_FRAMES=48`).
  - Each footage item's `{type:'vintage', mode}` effect wraps its media in the vintage treatment **scoped to the clip**: `film` → `<HtmlInCanvas>` with `paper()`+`noise()` and `filter: FILM_FILTER` (as `RoostReel` does for the montage, but per-clip); `vhs` → `filter: VHS_FILTER` plus a clip-scoped `<VintageOverlay mode="vhs" />`.
- `displayModeWrap(mode, media)`: `full-bleed` → `media`; `paper-frame` → the `PaperBackground` + centered 4:3 card from `MontageClip.tsx` (copy that JSX).
- Music: `<Audio src={staticFile(reel.tracks.music.source)} volume={musicVolumeAt} />` with the last-30-frame fade from `RoostReel`.
- Teaser overlay: the `overlays[]` item `content.kind==='teaser'` → a `<Sequence from={round(startMs/1000*fps)} durationInFrames=…>` wrapping `<TeaserOverlay lines reveal fontSize />`.
- Watermark: the `brand[]` item `kind:'watermark'` → `<Sequence from={0} durationInFrames={round(endMs/1000*fps)}><Watermark …props /></Sequence>`.
- Background: solid `theme.colors.paper` fallback `AbsoluteFill` (as `RoostReel`).

- [ ] **Step 1: Build the renderer** following the mapping above, reusing the `videoNodes` assembly from `LayeredCampaignReel` verbatim (only `renderVideoItem`'s body differs).

- [ ] **Step 2: There is no unit test for the renderer** (it needs footage + a DOM canvas). Verification is by render in Task 10. Confirm it at least compiles into a bundle:

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit/projects/roost-reel-01
# after Task 9 wires Root.tsx to LayeredRoostReel, `npm run build` bundles it
```

(Defer the actual bundle/render to Task 10, which has the wired Root + config.)

- [ ] **Step 3: Commit**

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit
git add templates/roost-reels/src/LayeredRoostReel.tsx
git commit --no-gpg-sign -m "feat(roost): LayeredRoostReel — renders a LayeredReel with roost brand components"
```

---

### Task 9: Roost `.editor/` host + `remotion.config` alias parity

**Files:**
- Create: `/Users/xaralis/Workspace/roost/video-toolkit/templates/roost-reels/.editor/{main.tsx,editor-plugin.mts,index.html,vite.config.mts}` (clone campaign's, retarget to `LayeredRoostReel`)
- Modify: `templates/roost-reels/remotion.config.ts` (ensure `@video-toolkit/lib` + `@brand-lib` + `zod$` webpack aliases, matching `../video-toolkit/templates/campaign-reels/remotion.config.ts`)
- Modify: `templates/roost-reels/package.json` (add `editor` script + `@remotion/player`, `@xzdarcy/react-timeline-editor`)

**Interfaces:**
- The host passes `guidesMs={reel.meta.guidesMs}` to `LayeredTimeline` and renders `component={LayeredRoostReel}` in the `<Player>`; `/props` reads `LayeredRoostReel` defaultProps.

- [ ] **Step 1: Copy campaign's `.editor/` files** into roost's template `.editor/`, then in `main.tsx`: change the renderer import to `import { LayeredRoostReel } from '../src/LayeredRoostReel'`, set the `<Player component={LayeredRoostReel}>`, set `projectName="roost-reels"`, and pass `guidesMs={reel?.meta.guidesMs}` to `<LayeredTimeline>`. In `editor-plugin.mts` set `compositionId: 'LayeredRoostReel'` in both the `/props` reader and `createSaveHandler`.

- [ ] **Step 2: Ensure `remotion.config.ts` aliases** match campaign's (brandLib + zod single-instance). Copy the alias block from `../video-toolkit/templates/campaign-reels/remotion.config.ts` if roost's differs.

- [ ] **Step 3: Add package.json wiring** — `"editor": "vite --config .editor/vite.config.mts --port 3100"`, and deps `@remotion/player` + `@xzdarcy/react-timeline-editor` (versions matching campaign's).

- [ ] **Step 4: Commit**

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit
git add templates/roost-reels/.editor templates/roost-reels/remotion.config.ts templates/roost-reels/package.json
git commit --no-gpg-sign -m "feat(roost): layered editor host + remotion webpack aliases for roost-reels"
```

---

### Task 10: Migrate `roost-reel-01` + render-verify

**Files:**
- Modify: `/Users/xaralis/Workspace/roost/video-toolkit/projects/roost-reel-01/src/Root.tsx` (register `LayeredRoostReel` with the derived reel literal)
- Add: `projects/roost-reel-01/src/LayeredRoostReel.tsx`, `.editor/`, updated `package.json`/`remotion.config.ts` (synced from the roost template, as campaign's migration did)

- [ ] **Step 1: Derive the reel.** Write a one-off migration script (run with `npx vite-node` from a project dir whose `node_modules` carries `ts-morph`/`zod`/`prettier`). The campaign equivalent lived at `video-toolkit/projects/pp-namesti-republiky/.migrate/migrate-reel.mts` and is recoverable from git history (commit `a8cff50`'s parent range) — use it as the reference shape. The roost script must: read `roost-reel-01/src/Root.tsx`'s `RoostReel` defaultProps via `readDefaultProps(src, { compositionId: 'RoostReel' })` (from `toolkit/lib/editor/src/default-props-writer`), run `deriveMontageLayered(cfg)` (from `toolkit/lib/reel-config-base/derive-montage`), assert `LayeredReelSchema.parse(reel)`, then `rewriteDefaultProps(templateRootSource, { reel }, { compositionId: 'LayeredRoostReel' })` + prettier-format → write `roost-reel-01/src/Root.tsx`. Then copy the template's `src/LayeredRoostReel.tsx`, `.editor/`, and `remotion.config.ts` into the project, and set `render`/`editor` scripts in its `package.json` to target `LayeredRoostReel`.

- [ ] **Step 2: Render smokes** (relink `.bin/remotion` first if MODULE_NOT_FOUND):

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit/projects/roost-reel-01
npx remotion still src/index.ts LayeredRoostReel /tmp/roost-photo.png --frame=20 --scale=0.5     # photo + kenBurns + vintage
npx remotion still src/index.ts LayeredRoostReel /tmp/roost-paper.png --frame=90 --scale=0.5     # paper-frame video clip
npx remotion still src/index.ts LayeredRoostReel /tmp/roost-teaser.png --frame=5 --scale=0.5     # teaser overlay
```

For the outro still, read `meta.totalDurationMs` from the migrated `roost-reel-01/src/Root.tsx`, compute the last frame `LAST = round(totalDurationMs/1000 * 30) - 1`, and render it:

```bash
npx remotion still src/index.ts LayeredRoostReel /tmp/roost-outro.png --frame=<LAST> --scale=0.5   # outro logo
```

- [ ] **Step 3: Visually confirm** each still shows the expected content: KenBurns photo with film/vhs grade, a paper-frame video card, the cream/brown teaser stack, and the ROOST outro logo. Compare against a still from the OLD `RoostReel` composition at the same times for close parity:

```bash
npx remotion still src/index.ts RoostReel /tmp/roost-old-photo.png --frame=20 --scale=0.5
```

- [ ] **Step 4: Full render** to confirm the whole reel renders end-to-end:

```bash
npx remotion render src/index.ts LayeredRoostReel /tmp/roost-full.mp4 --scale=0.5
```

Expected: completes; duration ≈ `meta.totalDurationMs`.

- [ ] **Step 5: Commit**

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit
git add projects/roost-reel-01
git commit --no-gpg-sign -m "feat(roost): migrate roost-reel-01 to the layered model (render-verified)"
```

---

### Task 11: Roost brand rules — vintage-by-default

**Files:**
- Create/Modify: `/Users/xaralis/Workspace/roost/video-toolkit/brands/roost/BRAND-RULES.md`

- [ ] **Step 1: Add the instruction.** Append (or create the file with) a rule section stating exactly:

```markdown
## Vintage treatment (cut default)

When cutting a roost reel, apply the brand vintage effect to EVERY footage item
(photo and video) by default — add `{ type: 'vintage', mode: '<film|vhs>' }` to
each footage item's `effects`, using the brand's chosen mode. Do NOT apply it to
the outro or teaser. The user may override per-clip in the editor (remove it from
individual clips, or switch a clip's mode). This is a default, not a mandate: if
the user asks for no vintage, omit it.
```

Pick the brand's default mode (`film` unless the brand owner specifies `vhs`).

- [ ] **Step 2: Confirm core `/cut` reads brand rules** (no code change) — it already loads `brands/<brand>/BRAND-RULES.md`. Nothing to run; this is documentation the cut command consumes.

- [ ] **Step 3: Commit**

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit
git add brands/roost/BRAND-RULES.md
git commit --no-gpg-sign -m "docs(roost): brand rule — apply vintage to all footage by default on cut"
```

---

## Final verification (after all tasks)

- [ ] Core suite green: `cd core/lib/editor && npx vitest run` (all files, incl. new `derive-montage`, `at-cut-transitions`, `LayeredTimeline`, `LayeredInspector` tests).
- [ ] Campaign parity: at least `pp-namesti-republiky` + `pp-05` render a 0–30 frame range post-extraction.
- [ ] Roost: `roost-reel-01` renders full at `--scale=0.5`, and the four stills (photo/paper/teaser/outro) visually match the old `RoostReel` closely.
- [ ] No submodule pointers committed in either brand repo (`git status` shows `toolkit` modified/unstaged only).
```
