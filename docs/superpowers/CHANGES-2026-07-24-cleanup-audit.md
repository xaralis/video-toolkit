# Summary of changes — dead-code cleanup + smell audit (2026-07-24)

Post-refactor cleanup across the three repos after both brands were folded onto core
`SegmentMedia`/`buildVideoNodes`. Three parallel evidence-backed audits (core/roost/campaign)
drove it. **Every live composition renders byte-identical to before** — zero output impact.
All brand commits unsigned (per request).

## Dead code removed

**Legacy pre-migration compositions retired in full** (your call — "retire fully"):
- **Roost** (`1bde1cf`, `1ef2fbf`): deleted the `RoostReel` composition + its whole chain — `BeatMontage`, `MontageClip`, `KenBurnsPhoto`, `TeaserOverlay`, the orphaned `config/schema.ts`(+test), and the now-dead `demo.config.json`. The template's `Root.tsx` now registers `LayeredRoostReel` (it previously only demoed the legacy one).
- **Campaign** (`aa3f9d4`): deleted the 3 smoke-test projects entirely (`pp-smoke-01/02/03` — pp-smoke-01 was the last live `CampaignReel` consumer), then the dead `CampaignReel` chain across the template + 11 real projects (`CampaignReel.tsx`, `config/schema.ts`+tests, `pp-05`'s forked segments/overlays, orphaned duration helpers), and trimmed the mixed-liveness config files (`reel-config.ts` kept `fps/width/height`; `types.ts` kept `CardSegment`). **~48k lines / 274 files removed.**
- **Roost** (`b4be7a1`): removed the dead `VINTAGE_FILTER` alias (zero importers).

## Smells fixed

- **Core** (`678c2ed`, `aeb6bf0`): `GenericWatermark` cornerStyle → declarative map with a typed indexed-assign (avoids an index-signature widening / TS2739); typed style consts instead of inline `as CSSProperties` casts in `GenericWatermark`/`GenericTextOverlay`; explicit `import type React` in `types.ts`; documented the permissive `crop`/`grade` casts in `SegmentMedia`.
- **Campaign** (`43abe18`): dropped the dead `chevron` prop threaded through all four segment components + `renderVideoItem` (chevron renders once at the root); removed the dead `kenBurns` extraction/plumbing for photo (`SegmentMedia` reads it from `effects`); removed a stale `audioMode: 'silent'` field from the template demo.
- **Campaign** (`b35b203`): `PhotoSegment` overlay spread cast to each component's `ComponentProps` instead of `never` (fixes the pre-existing TS2698).
- **Roost** (`b4be7a1`): corrected a stale comment referencing a non-existent `<FilmGrain>`.

## Kept (not dead — evidence-backed)

- Core legacy `lib/components/*` + `lib/theme/` — only consumed by the bundled `examples/hello-world`, not the editor/theming/render; left intact.
- All `@brand-lib/segments/*` and `@brand-lib/overlays/*` — every one has a live importer from `LayeredCampaignReel`.

## Verification

- Core suite: **369 tests pass**. All three git trees clean (only the `toolkit` submodule pointer).
- `LayeredRoostReel` frame 150 = 3,701,087 B and `LayeredCampaignReel` frame 81 = 1,714,231 B — **byte-identical to the pre-cleanup baselines**.

## Deferred (noted, not done)

- **`BrollSegment` blend layer** re-derives crop/grade/Ken-Burns that `SegmentMedia` already computes — a real dedup, but the blend rendering is tuned and higher-risk; left for a reviewed pass.
- **Doc drift:** roost & campaign `README.md`/`CLAUDE.md` still describe the deleted `RoostReel`/`CampaignReel`/`BeatMontage` architecture — needs a docs refresh.
- **`GenericWatermark`** sits outside the `BrandTheme` registry pattern (no watermark registry) — likely future work; roost/campaign use their own watermark renderers anyway.
- **`lib/theming/*` isn't standalone `tsc`-checkable** (react/remotion don't resolve from that path in any current tsconfig; vitest + renders are the functional gate) — worth a dedicated theming tsconfig someday.
