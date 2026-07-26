// lib/theming/generic/media-source.ts — the ONE place core's generic renderers
// turn a config-authored source string into a URL Remotion can load.
//
// Task 3 left this as a two-line placeholder (http passthrough + staticFile)
// "structured so Task 6 can swap it in one place". Task 6 did: the body now
// runs core's single media-path rule (../media-source.ts) first and applies
// `staticFile` after, so a generic renderer follows the same folder convention
// as SegmentMedia, the audio track and the editor timeline.
//
// Role defaults to 'brand': every source a generic renderer resolves today
// (GenericOutro's video/audio props, GenericWatermark's assets) is a brand
// asset that is already public/-relative, and 'brand' has no folder in
// ROLE_FOLDERS — so the resolved value is byte-identical to the placeholder's.
import { staticFile } from 'remotion';
import { resolveMediaSource, type MediaRole, type MediaSourceResolver } from '../media-source';

/** Source string → loadable URL: core's media-path rule, then `staticFile`
 *  (an absolute http(s) URL passes through untouched). `override` is a brand's
 *  wholesale {@link CompositionTheme.resolveMediaSource}. */
export function resolveGenericSource(
  source: string,
  role: MediaRole = 'brand',
  override?: MediaSourceResolver,
): string {
  const path = (override ?? resolveMediaSource)(source, role);
  return path.startsWith('http') ? path : staticFile(path);
}
