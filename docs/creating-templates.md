# Creating Templates

A template is a brand's reel: its look, its renderers, its copy discipline. It is
**not** a video assembly — core owns that. `LayeredReelComposition`
(`lib/render/layered-composition.tsx`) renders every track of a `LayeredReel` the
same way for every brand, so what a template adds is a `CompositionTheme` and
whatever custom renderers that theme registers.

Templates live in a **brand repo**, never in core (core ships no brand identity).
The reference implementation of the contract is `examples/layered-minimal` —
four small files that render end to end. Read it first; this document is the
narration around it.

## The contract in one picture

```
LayeredReel (data)        CompositionTheme (look)
  tracks.video    ─┐        accentSlots      ← the brand's palette keys
  tracks.audio     │        background
  tracks.music     ├──►  LayeredReelComposition  ──►  frames
  tracks.overlays  │        overlays / video    ← per-kind renderer registrations
  tracks.brand    ─┘        overlayItems        ← per-kind routing
                            prepareVideoTrack
                            renderBrandTrack
                            resolveAudioSource
```

The reel is DATA: one absolute-millisecond timeline, independent tracks, every
item carrying its own `[startMs, endMs)`. It is what `/toolkit:cut` writes, what
the editor edits, and what lives inline in a project's `Root.tsx` `defaultProps`.

The theme is CODE: React components and functions. That split is why a template
needs a thin wrapper component — `defaultProps` must stay JSON-serializable, so
the theme is bound in code and only the reel travels through props:

```tsx
export const MyBrandReel: React.FC<{ reel: LayeredReel }> = ({ reel }) => (
  <LayeredReelComposition reel={reel} theme={compositionTheme} />
);
```

## Template structure

```
templates/my-template/
├── package.json
├── tsconfig.json          # paths: @video-toolkit/lib/* → ../../toolkit/lib/*
├── remotion.config.ts     # the alias AND resolve.modules (see below)
├── src/
│   ├── index.ts           # registerRoot
│   ├── Root.tsx           # <Composition> + the reel literal in defaultProps
│   ├── MyBrandReel.tsx    # the wrapper that binds the theme
│   └── config/
│       ├── composition-theme.tsx   # the CompositionTheme
│       └── …                       # renderers, fonts, brand constants
└── public/
```

### The one setup line people forget

`lib/render` does a **runtime** import of `@remotion/transitions/*`, and `lib/`
sits outside the project's own tree, so webpack's default upward module walk
never reaches the project's `node_modules`. Every consuming project's
`remotion.config.ts` must therefore add:

```ts
resolve: {
  modules: [path.resolve(process.cwd(), 'node_modules'), 'node_modules'],
  alias: { '@video-toolkit/lib': toolkitLib },
}
```

Without it the bundle fails with `Can't resolve '@remotion/transitions/…'`. See
[lib/render/README.md](../lib/render/README.md).

## Writing the theme

Only two fields are required — `accentSlots` and `background`. Everything else is
an opt-in override of a core default.

```tsx
export const compositionTheme: CompositionTheme = {
  // The brand owns the palette: the COUNT and the KEYS are yours. Accent markup
  // in overlay text (`{accent:…}`) and any transition that takes a colour name
  // one of these keys — never a hex.
  accentSlots: [
    { key: 'accent', label: 'Accent', color: '#f2b544' },
    { key: 'cool', label: 'Cool', color: '#5ec8d8' },
  ],
  background: '#07090f',

  // Per-kind overlay renderer. Omit it and core's GenericTextOverlay draws text.
  overlays: { text: { renderer: BrandText, config: { …brand knobs } } },

  // Per-kind video renderer. clip/broll/photo already fall back to core's
  // SegmentMedia (trim, crop, focal point, grade, Ken Burns); card/outro/
  // multi-clip render ONLY when you register them.
  video: { outro: { renderer: OutroSegment }, card: { renderer: CardSegment } },

  // How a kind reaches the screen: 'track' (its own absolute Sequence, the
  // default) or 'anchored' (handed to the owning video renderer instead).
  overlayItems: {
    title: { routing: 'anchored' },
    'stat-callout': { render: (item) => <StatCallout item={item} /> },
  },

  // The whole brand layer as one node — you decide how many components that is.
  renderBrandTrack: (items) => <PersistentOverlay items={items} />,
};
```

### What core already does for you

Do not re-implement these in a template:

| Concern | Where it lives |
|---|---|
| Video track assembly + at-the-cut handle borrowing | `lib/render/video-track.tsx` |
| Real transitions across a cut | `lib/render/at-cut-transitions.tsx` |
| The transition vocabulary | `lib/reel-config-base/transition-schema.ts` |
| Footage rendering (trim/crop/focal/grade/Ken Burns) | `lib/theming/segment/SegmentMedia.tsx` |
| Overlay appear/hold/disappear envelope | `lib/theming/envelope.ts` (`useOverlayEnvelope`) |
| Placement vocabulary | `lib/theming/placement.ts` (`PLACEMENTS`) |
| Accent markup parsing | `lib/transcripts/accent-parser.ts` (`parseAccents`) |
| Audio track, music envelope | `lib/render/audio-track.tsx`, `lib/reel-config-base/music-envelope.ts` |

A renderer receives a static prop bag (`OverlayRenderProps` / `VideoRenderProps`)
and reads frame-derived values from Remotion hooks inside itself. Keep it that
way — that is what lets the same renderer run under Studio, a render, and the
editor's `<Player>`.

### Transitions

A transition is declared **once**, by the item leaving the cut
(`transitionOut`), and the next item borrows handle frames automatically. Adding
a new kind means appending one catalog entry in
`lib/reel-config-base/transition-schema.ts` — the zod union, the editor dropdown,
its sub-option controls and its defaults all follow, and the compiler then
demands a mapping in `lib/render/at-cut-transitions.tsx`. See
[lib/transitions/README.md](../lib/transitions/README.md) for the per-transition
options.

### Frame-based animation

Always Remotion's `interpolate`/`spring` off `useCurrentFrame()`, never CSS
transitions — CSS animation does not exist at render time:

```tsx
const frame = useCurrentFrame();
const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
```

And always `<OffthreadVideo>`, never a raw `<video>` element.

## Starting a new template

1. In a brand repo, copy an existing template
   (`cp -r templates/campaign-reels templates/my-template`), or start from
   `examples/layered-minimal` when you want the smallest possible base.
2. Rename it in `package.json`, then repoint **both** paths into `lib/` — they are
   relative to where the copy came from, so a copy that moves resolves to nothing:
   - `tsconfig.json` → `"@video-toolkit/lib/*": ["../../toolkit/lib/*"]`
   - `remotion.config.ts` → `path.resolve(process.cwd(), '../../toolkit/lib')`
     (webpack does not read tsconfig paths, so the two must be kept in sync — this
     is the one setup line people forget).
3. Write `src/config/composition-theme.tsx`: accent slots, background, then only
   the renderers your brand genuinely needs.
4. Keep the reel literal inline in `Root.tsx` `defaultProps` — Studio and the
   toolkit editor read it out of the file and write edits back in place, which
   they can only do while it is literally there.
5. Verify by rendering, not by typechecking: `npx remotion still src/index.ts
   <Id> out/frame.png --frame=<n>` at a clip, a transition midpoint and an
   overlay window.
6. Record it in the brand repo's own registry/docs. Core's
   `_internal/toolkit-registry.json` tracks core's components and transitions;
   templates are brand-owned.

## Template ideas

- **Product demo**: problem → solution → demo → CTA
- **Tutorial**: chapter-based with a progress indicator
- **Changelog**: version header with a feature list
- **Comparison**: before/after, via a `multi-clip` item
