# Audio Subsystem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the editor a **derived music-volume envelope** on the Music lane, **audio waveforms** on the Audio/Music blocks, and Music base + bed in-point editing — by extracting the composition's music math into a shared pure function and computing waveform peaks in the browser.

**Architecture:** A pure `computeMusicEnvelope(reel, {fps})` in core becomes the single source of truth for the music envelope (composition consumes its `volumeAt`, editor draws its `points`). Editor-only `useAudioPeaks` decodes audio via the Web Audio API and a `Waveform` component draws peaks inside xzdarcy blocks via `getActionRender`. Spike-first on waveform decoding.

**Tech Stack:** TypeScript (core `lib/reel-config-base`); React + Web Audio API + xzdarcy `getActionRender` (editor `lib/editor`); Vitest. Node 20.

## Global Constraints

- **Spec:** [2026-07-22-audio-subsystem-design.md](../specs/2026-07-22-audio-subsystem-design.md) — D1–D4 bind every task.
- **Parity:** `computeMusicEnvelope` must be a *faithful* port of `LayeredCampaignReel`'s current `musicVolumeAt`/`findPrimaryVideoItemAt` (the composition adopts it; audio behavior must not change). Video stills stay byte-identical.
- **Envelope is read-only** (shaped indirectly by a clip's `musicBoostDb`); **waveforms are editor-only** (composition doesn't need them). Timeline slip-drag + manual keyframes are non-goals.
- **Reuse, don't rebuild:** the existing `musicVolumeAt` math, `LayeredTimeline`/`LayeredInspector`/adapter, xzdarcy `getActionRender`, surgical Save. New units only where the spec names them.
- Node 20 (`~/.nvm/versions/node/v20.18.1/bin`); core tests `cd lib/editor && npx vitest run`. Commit signing disabled. Branch latitude on `feat/reel-editor-skeleton`. After a core commit the pilot consumes, re-sync the `toolkit/` submodule. Browser-verify over the pilot `pp-namesti-republiky` (`npm run editor`).

---

### Task 1: `computeMusicEnvelope` shared function + composition adopts it

**Files:**
- Create: `lib/reel-config-base/music-envelope.ts`
- Test: `lib/editor/src/music-envelope.test.ts`
- Modify (pilot, video-toolkit): `projects/pp-namesti-republiky/src/LayeredCampaignReel.tsx` — import + use it, remove the inline copy.

**Interfaces (produces):**

```ts
// lib/reel-config-base/music-envelope.ts
import type { LayeredReel, VideoItem } from './layered-schema';

export interface MusicEnvelope {
  /** Linear gain for the <Audio volume> callback (per composition frame). */
  volumeAt: (frame: number) => number;
  /** Polyline vertices (frame → linear gain) for drawing the envelope. */
  points: Array<{ frame: number; gain: number }>;
}

// Faithful extraction of LayeredCampaignReel.tsx's musicVolumeAt (verified against
// it): base gain × 10^(item.musicBoostDb/20) of the primary video item at the
// frame, with the last-1s outro linear fade and silence after the outro end.
export function computeMusicEnvelope(reel: LayeredReel, opts: { fps: number }): MusicEnvelope {
  const { fps } = opts;
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);
  const outroItem = reel.tracks.video.find((v) => v.kind === 'outro');
  const outroEndFrame = outroItem ? msToFrames(outroItem.endMs) : null;
  const OUTRO_FADE_OUT_FRAMES = fps; // last 1 second
  const outroFadeOutStart = outroEndFrame !== null ? outroEndFrame - OUTRO_FADE_OUT_FRAMES : null;
  const baseVolume = Math.pow(10, (reel.tracks.music.baseVolumeDb ?? -8) / 20);

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
    if (outroEndFrame !== null && f >= outroEndFrame) return 0;
    const item = findPrimaryVideoItemAt(f);
    const boostDb = item?.musicBoostDb ?? 0;
    let factor = Math.pow(10, boostDb / 20);
    if (outroFadeOutStart !== null && outroEndFrame !== null && f >= outroFadeOutStart && f < outroEndFrame) {
      const t = (f - outroFadeOutStart) / OUTRO_FADE_OUT_FRAMES;
      factor *= 1 - t;
    }
    return baseVolume * factor;
  };

  // Vertices for a step/ramp polyline: each video item start (level steps), the
  // outro fade start + its last frame + the outro end (ramp to 0), and 0/total.
  const totalFrames = msToFrames(reel.meta.totalDurationMs);
  const verts = new Set<number>([0, totalFrames]);
  for (const v of reel.tracks.video) verts.add(msToFrames(v.startMs));
  if (outroFadeOutStart !== null) verts.add(outroFadeOutStart);
  if (outroEndFrame !== null) { verts.add(outroEndFrame); verts.add(Math.max(0, outroEndFrame - 1)); }
  const points = [...verts]
    .filter((f) => f >= 0 && f <= totalFrames)
    .sort((a, b) => a - b)
    .map((frame) => ({ frame, gain: volumeAt(frame) }));

  return { volumeAt, points };
}
```

- [ ] **Step 1: Failing test** — `lib/editor/src/music-envelope.test.ts` builds a small `LayeredReel` (a voice clip [0,90f→3000ms], a silent broll with `musicBoostDb:6`, an outro with `musicBoostDb:10` and `kind:'outro'`), `baseVolumeDb:-8`, fps 30. Assert (using the exact formulas): `volumeAt` mid-clip = `10^(-8/20)` (base, boost 0); mid-broll = `base × 10^(6/20)`; mid-outro (not last 1s) = `base × 10^(10/20)`; at `outroEnd - 1` frame in the fade = base×10^(10/20)×(1−t); `>= outroEnd` = 0. Assert `points` is sorted, starts at frame 0, includes the outro end with gain 0.
- [ ] **Step 2: Run → fails** (`cd lib/editor && npx vitest run src/music-envelope.test.ts`).
- [ ] **Step 3: Implement** `music-envelope.ts` exactly as above.
- [ ] **Step 4: Run → passes**; full `lib/editor` suite + `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit (core)** `feat(layered): computeMusicEnvelope — shared derived music envelope`.
- [ ] **Step 6: Composition adopts it** — in the pilot's `LayeredCampaignReel.tsx`, replace the inline `outroItem…musicVolumeAt` block with `const { volumeAt } = computeMusicEnvelope(reel, { fps });` and use `volume={volumeAt}` on the music `<Audio>`. Remove the now-dead `findPrimaryVideoItemAt`/`outroFadeOutStart`/`baseVolume` locals. Re-sync the submodule first so the import resolves.
- [ ] **Step 7: Parity** — `npx remotion still src/index.ts LayeredCampaignReel out/env-f200.png --frame=200` stays byte-identical to the prior `out/*-f200.png` (video unaffected). Commit (video-toolkit) `refactor(pilot): LayeredCampaignReel uses shared computeMusicEnvelope`.

---

### Task 2: `useAudioPeaks` + `Waveform` — decode spike

**Files (core editor):**
- Create: `lib/editor/app/useAudioPeaks.ts`, `lib/editor/app/Waveform.tsx`

**Interfaces:**
- `useAudioPeaks(sources: string[], resolveUrl: (source: string) => string): { peaks: Map<string, Float32Array>; loading: Set<string> }` — module-level cache keyed by resolved URL; fetch → `AudioContext.decodeAudioData` → downsample the (mono-mixed) channel to a fixed peaks-per-second resolution → store. Decodes each source once; safe across re-renders.
- `Waveform({ peaks, startMs, endMs, sourceInMs, color }): JSX` — an SVG polyline/bars drawing the slice `[sourceInMs, sourceInMs + (endMs−startMs)]` of `peaks` scaled to fill its container (`width/height: 100%`). Flat baseline when `peaks` is undefined.

**Approach (spike — Web Audio decoding is the risk):**
- `resolveUrl`: audio `source` files are served from the editor's public dir — `recordings/<name>` for clip/broll beds, `audio/<name>` for music (the composition uses `staticFile('recordings/'+…)` / the music path). Map source → served URL accordingly (read how `LayeredCampaignReel` prefixes sources).
- Downsample: for an N-second source at P peaks/sec, reduce `getChannelData(0)` to `N*P` max-abs buckets.

- [ ] **Step 1:** Build `useAudioPeaks` + `Waveform`. Add a **temporary spike mount** in the pilot editor (e.g. render `<Waveform>` for ONE known source, `seg-001`'s bed `20260629_130655.mp4`, above the timeline) OR log peaks length.
- [ ] **Step 2: SPIKE VERIFY (browser)** — `npm run editor`; confirm the source decodes (peaks length > 0) and one waveform renders (screenshot). If `decodeAudioData` can't decode the mp4 audio in the browser, STOP and report BLOCKED (fallback: pre-render peaks server-side / a different decode path).
- [ ] **Step 3:** Remove the temporary spike mount. Commit (core) `feat(editor): useAudioPeaks + Waveform (Web Audio decode) — spike verified`.

> No unit test (browser Web Audio + SVG). Gate = the spike renders a real waveform.

---

### Task 3: Waveforms in the Audio + Music blocks

**Files (core editor):** `lib/editor/app/LayeredTimeline.tsx`.

**Approach:** collect the unique audio sources from `reel.tracks.audio` (+ `reel.tracks.music.source`), call `useAudioPeaks`, and in `getActionRender` for `audio` and `music` lanes, render `<Waveform peaks={peaks.get(url)} startMs endMs sourceInMs …/>` behind the label. Audio item's `sourceInMs` slices the bed; the music block spans the whole reel (sourceInMs 0). Keep the existing label on top of the waveform.

- [ ] **Step 1:** Wire `useAudioPeaks` (sources from the reel) + render `<Waveform>` inside audio/music `getActionRender` (label overlaid). Non-audio lanes unchanged.
- [ ] **Step 2: Browser-verify** — audio beds + the music block show waveforms; they slice per `sourceInMs`; other lanes unaffected; no console errors; scrolling/zoom still fine.
- [ ] **Step 3: Commit (core)** `feat(editor): audio waveforms on Audio + Music lanes`.

---

### Task 4: Music-lane envelope overlay

**Files (core editor):** Create `lib/editor/app/MusicEnvelope.tsx`; wire into `LayeredTimeline`'s Music lane.

**Approach:** `MusicEnvelope({ points, totalFrames, gainToY })` draws an SVG polyline over the Music row from `computeMusicEnvelope(reel,{fps}).points`, mapping `frame → x` (same scale as the timeline: `x = startLeft + frame/fps * scaleWidth`) and `gain → y` (e.g. dB `20*log10(gain)` mapped to the row height, clamped). Render it as an overlay spanning the Music row width, above the music block's waveform. Read-only.

- [ ] **Step 1:** Build `MusicEnvelope`; overlay it on the Music lane aligned to the timeline x-scale (reuse `scaleWidth`/`startLeft`/`fps`). Recompute via `computeMusicEnvelope` (memoized on reel).
- [ ] **Step 2: Browser-verify** — the envelope steps up over the silent brolls (+6) and the outro (+10) then ramps to 0 at the end; changing a clip's `musicBoostDb` in the inspector redraws it.
- [ ] **Step 3: Commit (core)** `feat(editor): derived music-volume envelope on the Music lane`.

---

### Task 5: Music inspector panel + audio in-point round-trip

**Files (core editor):** `lib/editor/app/LayeredInspector.tsx`.

**Approach:** add the `music` route — selecting the Music block shows base volume (`tracks.music.baseVolumeDb`) + `source`. Since `music` is not an item array, patch `reel.tracks.music` directly (a small `patchMusic` that returns `{ ...reel, tracks: { ...tracks, music: { ...music, ...patch } } }`). Verify the audio route's existing "In-point (s)" field slips the bed and the waveform (Task 3) re-slices on change.

- [ ] **Step 1:** Add the `music` inspector route (base volume dB + source), patching `tracks.music`. Add a routing note for the `music` lane in the selection logic.
- [ ] **Step 2: Browser-verify full round-trip** — select Music → change base volume → envelope redraws → Save → `/props` re-parses; select an audio bed → change In-point → waveform re-slices + Player audio shifts → Save. Revert test edits.
- [ ] **Step 3: Integration pass** + short report to `.superpowers/sdd/subspec3-report.md`. Commit (core) `feat(editor): music inspector (base/source) + audio bed in-point verified`.

---

## Self-Review
- **Spec coverage:** D1 envelope shared+viz (T1, T4), D2 waveforms (T2 spike, T3), D3 music inspector (T5), D4 bed in-point (T5). Composition adopts the shared function (T1) — parity guarded by byte-identical stills.
- **Placeholder scan:** T1 has complete code (exact port). T2–T5 are browser/Web-Audio/SVG integration with concrete approaches + browser gates; the waveform decode is spike-gated (T2 Step 2) with a named fallback. No TBDs.
- **Type consistency:** `computeMusicEnvelope`/`MusicEnvelope`/`volumeAt`/`points` names identical across T1/T4; `useAudioPeaks`/`Waveform` props consistent T2/T3; `patchMusic` mirrors the existing `patchItem` shape.

## Next (rollout, not this sub-spec)
Promote the layered editor + `LayeredCampaignReel` from the pilot into the `campaign-reels` template; flip the remaining projects (mechanical); `/cut` emits the layered model directly. Retire the old segment-centric composition once all projects are flipped.
