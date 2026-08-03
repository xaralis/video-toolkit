// Isolates the ONLY static imports of `remotion` and `@remotion/media-utils` reachable
// from `layered-composition-props.ts`'s `calculateMetadata`.
//
// `layered-composition-props.ts` reaches this module through a DYNAMIC `import()` inside
// `calculateMetadata`, never a static top-level one. A static import there would be
// eagerly resolved the moment that file loads — and `lib/editor/host/host-duration.ts`
// loads it for `MIN_FRAMES` alone, a plain constant. `@remotion/media-utils` is not a
// dependency of a brand project's own `node_modules` (that is exactly what
// `docs/superpowers/handle-starvation-migrations.md` asks brands to add, for the RENDER
// side only), so `lib/editor/host/vite-config.mts`'s `isRemotionSpecifier` plugin would
// re-resolve the bare specifier from the brand project root and fail with
// module-not-found the instant the editor's Vite dev server tried to load it — bit for
// bit the Phase 2 `@remotion/player` failure recorded in
// `docs/superpowers/phase2-migrations.md:17-20` (found only by opening the editor in a
// browser). Keeping every reference to these two packages OUT of this file's importers'
// static graph, and behind `import()` here instead, is what keeps that path clean. See
// CRITICAL 2 of the 2026-08-03 whole-branch review.
//
// `getVideoMetadata` is `@deprecated` as of `@remotion/media-utils@4.0.425`, in favour of
// `parseMedia()` from `@remotion/media-parser` — noted here so the next Remotion version
// bump is a planned migration, not a surprise found mid-upgrade.
import { staticFile } from 'remotion';
import { getVideoMetadata } from '@remotion/media-utils';
import { resolveMediaSource, type MediaRole } from '../theming/media-source';

/** A few seconds — long enough for a real file on a slow disk or network, short enough
 *  that one stalled source cannot leave Studio on "loading composition" forever, or turn
 *  a would-be-successful CLI render into a composition-selection failure.
 *  `getVideoMetadata` settles only on the underlying `<video>`'s `loadedmetadata`/`error`
 *  events (`resolve-video-config.js` applies no timeout of its own), so a hung fetch
 *  otherwise never settles at all — and `calculateMetadata` gates composition resolution,
 *  the one thing this whole feature promised never to do (Important 6 of the review). A
 *  timed-out source is treated exactly like a failed one: ABSENT from the returned map,
 *  hence read as unbounded by `handleRoomFrames`, hence never reported as starvation. */
const MEASURE_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`handle-starvation: measurement timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Resolves `source` exactly as every renderer does — `SegmentMedia.tsx`'s `resolveSrc`
 *  (`../theming/segment/SegmentMedia.tsx:74-75`): through core's ONE media-path rule
 *  (`resolveMediaSource`), then `staticFile` — UNLESS the resolved path is already an
 *  absolute `http(s)` URL, since `staticFile` THROWS on one (the bug CRITICAL 1 of the
 *  review named: the old code called `staticFile` on the RAW, unresolved source, which
 *  404s for a brand's bare-filename convention — `lib/theming/media-source.ts:7-9` — and
 *  the failure was silently swallowed).
 *
 *  Returns the RESOLVED key alongside the fetchable URL: `key` is what
 *  `checkBoundaries`/`handleRoomFrames` look up, and it must be stable across environments
 *  (staticFile's own resolution only means something inside a bundled Remotion render).
 *
 *  Residual limitation, recorded rather than hidden: a brand that overrides
 *  `theme.resolveMediaSource` (`CompositionTheme.resolveMediaSource`, threaded to renderers
 *  as `VideoRenderProps.resolveMediaSource`) is NOT covered here — `calculateMetadata` has
 *  no theme to read an override from, so such a brand's sources still measure against the
 *  DEFAULT rule's path, which may not be where that brand actually serves the file. That
 *  gap is real and undetectable at this layer; only a brand-supplied `calculateMetadata`
 *  override could close it. */
function resolveForMeasurement(source: string, role: MediaRole): { key: string; url: string } {
  const key = resolveMediaSource(source, role);
  return { key, url: key.startsWith('http') ? key : staticFile(key) };
}

/** Measures every DISTINCT resolved source's real duration, in ms, keyed by the RESOLVED
 *  string — the same string `checkBoundaries` (`layered-composition-props.ts`) looks up,
 *  and the same rule the editor's `videoUrl()` (`LayeredTimeline.tsx`) resolves through,
 *  so both environments key off one canonical definition of "which file is this" rather
 *  than the raw, possibly-bare `source` (CRITICAL 1 of the review).
 *
 *  Only `clip`/`broll` items carry a source window at all — `handleRoomFrames`'s own gate
 *  — so items of any other kind (in particular `photo`, whose `.jpg`/`.png` extension
 *  `getVideoMetadata` can never resolve as a video anyway) are never even queued.
 *
 *  A source that fails to measure — network hiccup, unsupported format, or a timeout — is
 *  left ABSENT from the map rather than defaulted to 0: `handleRoomFrames` reads an absent
 *  entry as UNBOUNDED, so a measurement failure never masquerades as starvation. Nothing
 *  here throws. */
export async function measureSourceDurationsMs(
  items: ReadonlyArray<{ kind: string; source?: string }>,
): Promise<Record<string, number>> {
  const toMeasure = new Map<string, string>(); // resolved key -> fetchable url, de-duplicated by key
  for (const it of items) {
    if (it.kind !== 'clip' && it.kind !== 'broll') continue;
    if (!it.source) continue;
    const { key, url } = resolveForMeasurement(it.source, it.kind);
    if (!toMeasure.has(key)) toMeasure.set(key, url);
  }

  const durationsMs: Record<string, number> = {};
  await Promise.all(
    [...toMeasure.entries()].map(async ([key, url]) => {
      try {
        const meta = await withTimeout(getVideoMetadata(url), MEASURE_TIMEOUT_MS);
        durationsMs[key] = meta.durationInSeconds * 1000;
      } catch {
        // Left absent deliberately — see the doc comment above.
      }
    }),
  );
  return durationsMs;
}
