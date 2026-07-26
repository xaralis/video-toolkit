// lib/theming/generic/media-source.ts — the ONE place core's generic renderers
// turn a config-authored source string into a URL Remotion can load.
//
// Today that is the same two-line rule SegmentMedia uses: an absolute http(s)
// URL passes through untouched, anything else is a `public/`-relative path
// handed to `staticFile`.
//
// DELIBERATELY one exported function, called from every generic: Phase 3 Task 6
// introduces `resolveMediaSource` (brand-overridable source resolution, the way
// `CompositionTheme.resolveAudioSource` already works for audio) and swaps the
// body here — one edit, every generic follows. Do not inline this rule back
// into the renderers.
import { staticFile } from 'remotion';

/** `public/`-relative path → staticFile URL; absolute http(s) URL → unchanged. */
export function resolveGenericSource(source: string): string {
  return source.startsWith('http') ? source : staticFile(source);
}
