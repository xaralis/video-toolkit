// lib/theming/media-source.ts — core's ONE media-path rule.
//
// Before Phase 3 Task 6 the convention was written out three times: once in
// each of the two brand templates that vendor this core, and a third time —
// untested — in the editor's own `audioUrl`/`videoUrl`
// (app/LayeredTimeline.tsx). The two brands' rules genuinely CONFLICTED:
//
//   convention A   rule: startsWith('recordings/') || startsWith('broll/')
//                  data: BARE filenames        ('seg02.MP4')
//   convention B   rule: startsWith('http') || includes('/')
//                  data: FULL relative paths   ('media/VIDEO-2026-06-28.mp4')
//
// Core takes B, because it is the SUPERSET. A applied to B's data would
// re-prefix `media/…` into `recordings/media/…` and break every photo and
// broll item in that repo, whereas B applied to A's data prefixes bare
// filenames exactly as A's own rule did — a bare filename contains no slash.
// See lib/editor/src/media-source.test.ts: the idempotence case there IS that
// proof (it carries both brands' real source strings), and it is verified by
// mutation — swapping A's prefix list back in turns exactly that test red.
//
// THREE CONSTRAINTS, carried over verbatim from the brand file this replaces:
//
//  1. RESOLVE AT RENDER TIME ONLY. Never write the result back onto the item.
//     lib/transcripts' `loadTranscriptSync` derives
//     `recordings/<source>.transcript.json` from the BARE source — a resolver
//     that mutates the item breaks captions.
//  2. `staticFile` is NOT applied here. This returns a public/-relative path
//     (or an untouched absolute URL); the caller decides. That keeps this
//     module dependency-free, so the editor — which serves `/recordings/x.mp4`
//     URLs, not staticFile paths — shares the exact same rule, and so nothing
//     that imports it drags `remotion` into the editor's browser bundle.
//  3. `photo` deliberately gets NO folder. Both brands' photo sources are
//     already public-relative (one passes them unprefixed, the other's are
//     `media/…`), and so are `music` and `brand` assets.

/** What a source string is being loaded AS. Maps 1:1 onto `VideoItem.kind` for
 *  the footage kinds, plus the non-video tracks. */
export type MediaRole = 'clip' | 'broll' | 'photo' | 'audio' | 'music' | 'brand';

/** Folder each role's BARE filenames live in, relative to `public/`. A role
 *  absent from this table never gets a prefix — photo/music/brand sources are
 *  already public-relative in both brands. */
export const ROLE_FOLDERS: Partial<Record<MediaRole, string>> = {
  clip: 'recordings/',
  broll: 'broll/',
  audio: 'recordings/',
};

/** The ONE rule. Returns a public/-relative path; the caller applies
 *  `staticFile` (renderers) or a leading `/` (the editor's dev server).
 *
 *  - absolute (http/https) → unchanged
 *  - contains a slash      → unchanged  (a full `media/…` path, and an
 *                                        already-prefixed `recordings/…` —
 *                                        i.e. the rule is idempotent)
 *  - bare filename         → the role's folder prefix
 *  - role with no folder   → unchanged  (photo, music, brand)
 *
 *  NEVER write the result back onto the item: `loadTranscriptSync` derives the
 *  sidecar path from the BARE source. Resolve at render time only. */
export function resolveMediaSource(raw: string, role: MediaRole): string {
  if (raw.startsWith('http')) return raw;
  // The superset rule (convention B), deliberately, not the prefix list — see
  // the header. This one line is what makes full-path sources survive.
  if (raw.includes('/')) return raw;
  const folder = ROLE_FOLDERS[role];
  return folder ? `${folder}${raw}` : raw;
}

/** A brand-supplied wholesale override of the rule above
 *  ({@link CompositionTheme.resolveMediaSource}), threaded to renderers as
 *  `VideoRenderProps.resolveMediaSource`. */
export type MediaSourceResolver = (raw: string, role: MediaRole) => string;
