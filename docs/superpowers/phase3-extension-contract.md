# The extension contract — Phase 3 reference

**What this is.** Core ships a *generic* for every kind a reel can contain. A brand does not
copy those generics; it **registers** over them. This file is the reference for that
registration: the one resolution rule, the six axes it applies to, the two exceptions to it,
and a worked example of adding a brand kind end-to-end — render **and** editor.

Companion document: `phase3-migrations.md` (what each brand repo has to change to adopt this).

---

## 1. The one resolution rule

Every axis resolves the same way. One function, `lib/theming/registry.ts:56`:

```ts
export function resolveRegistered<P>(
  registry: Registry<P> | undefined,
  kind: string,
  generics: Record<string, React.FC<P>>,
): React.FC<P> | undefined {
  return registry?.[kind]?.renderer ?? generics[kind];
}
```

Read it as three statements:

1. **Brand wins.** A registration carrying a `renderer` replaces the core generic for that kind.
2. **A registration with NO `renderer` does NOT mask the generic.** It contributes
   `config` / `params` / (on the overlay axis) `routing` only, and the core generic still
   draws. This is what lets a brand re-route or re-configure a kind core can already draw —
   campaign-reels' `title: { routing: 'anchored' }` is exactly that, and PP's `title` still
   reaches a renderer because routing and drawing are separate decisions.
3. **`undefined` means SKIP, never throw.** A kind neither side knows renders nothing. Pinned
   by test on every axis: a config with a typo'd effect type must keep rendering.

Two helpers read the same registration without resolving a renderer:
`registrationConfig(registry, kind)` (`registry.ts:65`) and
`registrationParams(registry, kind)` (`registry.ts:70`).

### `Registration<P>` is deliberately closed

```ts
export interface Registration<P> {
  renderer?: React.FC<P>;
  config?: unknown;
  params?: readonly ParamField[];
}
```

There is **no index signature**, on purpose (`registry.ts:38-42`). With one, a typo'd
`rendererr:` would compile clean and the brand's renderer would silently vanish into the core
generic — the exact class of invisible brand regression Phase 3 exists to close. A per-axis
superset (`VideoRegistration`, `OverlayItemRegistration`, `BrandRegistration`) that adds its
own fields is assignable to `Registration<P>` without a freshness check, so the shared resolver
takes it as-is; a fresh object literal carrying a per-axis field must be typed as that superset.

---

## 2. The six axes

| Axis | Registry field | Prop bag | Core generics | Resolver |
|---|---|---|---|---|
| Overlay | `BrandTheme.overlays` | `OverlayRenderProps` | `text` (+ legacy alias `quote-pull`) | `lib/render/overlay-routing.ts` |
| Video | `BrandTheme.video` | `VideoRenderProps` | `clip`/`broll`/`photo` → `SegmentMedia`; `multi-clip`/`card`/`outro` → `Generic*` | `resolveVideoRenderer` (`lib/theming/brand-theme.ts:76`) |
| Effect | `BrandTheme.effects` | `EffectRenderProps` | `grain`, `scanlines`, `vignette`, `grade`, `transform` | `resolveEffectRenderer` (`lib/theming/effects/index.ts:79`) |
| Brand layer | `BrandTheme.brand` | `BrandRenderProps` | `watermark`, `disclaimer` | `resolveBrandRenderer` (`lib/theming/brand-track.tsx:45`) |
| Tokens | `BrandTheme.tokens` | — (typed constants) | every generic's look literals | direct read, `lib/theming/tokens.ts` |
| Media source | `CompositionTheme.resolveMediaSource` | — (a function) | `resolveMediaSource` (`lib/theming/media-source.ts:61`) | `override ?? core` |

The first four are registries and obey §1 verbatim. The last two are single-value overrides.

### Overlay — the one axis with a second draw path

`OverlayItemRegistration` adds two fields of its own (`lib/theming/types.ts:170`):

- `routing: 'track' | 'anchored'` — `track` (default) mounts one absolute `Sequence` per item
  over its own `[startMs, endMs)`. `anchored` instead hands the item to the owning video
  renderer as `VideoRenderProps.anchoredOverlays` (items with no `anchorVideoId` fall back to
  track). Use it when the video body needs to *see* the overlay — campaign's caption-lift is
  computed inside `FootageSegment` from the title it is handed.
- `render: (item) => ReactNode` — the item-level escape hatch, full control of the node,
  bypassing `OverlayRenderProps`. **Wins over `renderer` when both are present.**

**The trap, stated once:** at item level core honours `render` for **any** kind, but `renderer`
— which takes `OverlayRenderProps` — is consumed only through the core text adapter, i.e. for
the core kinds `text` and `quote-pull`. A `renderer` on a non-core kind
(`{ chevron: { renderer: X } }`) is **ignored**. Register such kinds with `render`.
(`lib/theming/types.ts:44-52`.)

### Video

`VideoRenderProps` (`types.ts:86`) carries `item`, `handles`, `config`, `anchoredOverlays`,
`boundAudio`, `tokens`, `resolveMediaSource`. Two rules a renderer must not break:

- **`boundAudio` is READ-ONLY.** Core's audio track already mounts every audio item. Mounting
  an `<Audio>` for `boundAudio` double-plays the voice.
- **Never write a resolved source back onto `item.source`.** `loadTranscriptSync` derives the
  caption sidecar path from the *bare* source. Resolve at render time only.

### Effect — a wrapper, and the reserved-type rule

An effect receives the media node and returns a decorated node. `applyEffects`
(`effects/index.ts:94`) folds an item's `effects[]` in array order, **innermost-first**: the
first entry sits closest to the media, the last outermost. An item with no effects gets its
media node back **referentially unchanged** — no wrapper is allocated.

**The reserved-effect-type rule.** `RESERVED_EFFECT_TYPES = { 'ken-burns' }`
(`effects/index.ts:65`) is checked at `effects/index.ts:106`, **before** resolution:

```ts
if (RESERVED_EFFECT_TYPES.has(effect.type)) continue;
const Renderer = resolveEffectRenderer(theme, effect.type);
```

`ken-burns` is a *style* effect — it composes into the media element's own
`transform`/`objectPosition`/`transformOrigin` alongside the crop, inside `SegmentMedia`. If
`applyEffects` also wrapped it, every ken-burns item would get the movement twice. Core not
shipping a `ken-burns` generic is **not** sufficient, because the registry is open-keyed: a
brand writing `effects: { 'ken-burns': { renderer: X } }` would otherwise resolve and
double-apply. So the skip precedes resolution, and **a brand that wants its own Ken Burns
overrides it on the VIDEO axis** — its own video renderer, which owns the media transform —
**not on the effect axis.** `editorMetaFromTheme` consults the same set, so a reserved-type
registration is inert at edit time too. One list, both ends.

**Where effects are applied, and what they therefore cover.** `applyEffects` is wired at
`renderVideoItemNode` in `lib/render/layered-composition.tsx`, **not** inside `SegmentMedia`.
It therefore wraps the video renderer's *entire* returned tree — including any
`anchoredOverlays` that renderer draws. If a brand's clip renderer draws its title inside
itself (campaign-reels does), a core `grade` or `grain` on that item will tint **the title text
too**. That is a semantic of where the seam sits, not a bug; know it before adopting a core
effect on such a renderer.

### Brand layer

`defaultRenderBrandTrack` (`brand-track.tsx:63`) mounts **one Sequence per item, spanning that
item's own `[startMs, endMs)`** — the same semantics as the overlay track. Both brands shipping
when this landed instead spanned `[0, max(endMs))` for every brand item via the whole-track
hook. Neither is wrong, but they differ the moment a brand item has a non-zero `startMs`.

`CompositionTheme.renderBrandTrack` remains the **whole-track escape hatch**: present, it wins
outright and `defaultRenderBrandTrack` never runs. Prefer the registry — registering per kind
gets Sequencing, config threading and token plumbing for free.

### Tokens

`ThemeTokens` (`tokens.ts:189`) is the typed home for the look constants a core *generic* draws
with. The discipline, stated once in the file and enforced by review: **every field optional,
every default NEUTRAL** (black / white / `sans-serif` / `monospace`), never a brand's value.
Where a real brand's value is known it is named in the doc comment as an *example*.

Tokens reach renderers as **one narrow typed field**, never the theme itself:
`renderVideoItemNode` threads `theme.tokens` → `VideoRenderProps.tokens`;
`defaultRenderBrandTrack` threads it → `BrandRenderProps.tokens`. Note the asymmetry:
`OverlayRenderProps` has **no** `tokens` field — the overlay axis gets brand data through
`config` on its registration.

Precedence on the brand layer, from `brand-track.tsx:26-32`: **tokens are the theme-wide look,
the item's own `props` win over them per field.**

### Media source

One rule, `resolveMediaSource(raw, role)` (`media-source.ts:61`):

- starts with `http` → unchanged
- **contains a slash → unchanged** (so a full `media/…` path survives, and the rule is
  idempotent over an already-prefixed `recordings/…`)
- bare filename → `ROLE_FOLDERS[role]` prefix (`clip`/`audio` → `recordings/`, `broll` →
  `broll/`)
- role with no folder (`photo`, `music`, `brand`) → unchanged

`CompositionTheme.resolveMediaSource` overrides it wholesale for every role.
`resolveAudioSource` is the deprecated audio-only predecessor and still **wins over**
`resolveMediaSource` on the audio track when present.

**Known gap:** `GenericWatermark` resolves through `resolveGenericSource(asset, 'brand')` with
**no override hook** (`GenericWatermark.tsx:132` — `WatermarkProps` carries no theme). Harmless
today, since role `brand` has no folder and is therefore the identity; but a brand registering a
wholesale `resolveMediaSource` gets a silently *inconsistent* result — its outro asset routed
through the override, its watermark not. A brand needing one registers its own watermark
renderer.

---

## 3. Worked example — registering a brand kind end-to-end

The point of Task 7 is that **one declaration serves both render and editor**. Here is a brand
adding a `ticker` overlay kind: a scrolling strip core has never heard of.

### 3.1 The renderer

```tsx
// src/overlays/Ticker.tsx
import { AbsoluteFill } from 'remotion';
import { useOverlayEnvelope } from '@video-toolkit/lib/theming';
import type { OverlayItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

export const Ticker: React.FC<{ item: OverlayItem }> = ({ item }) => {
  const c = item.content as { text?: string; speed?: number };
  const { visible, opacity, localFrame } = useOverlayEnvelope({
    durationMs: item.endMs - item.startMs,
  });
  if (!visible || !c.text) return null;
  const x = -(localFrame * (c.speed ?? 4));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
      <div style={{ position: 'absolute', bottom: 120, whiteSpace: 'nowrap', transform: `translateX(${x}px)` }}>
        {c.text}
      </div>
    </AbsoluteFill>
  );
};
```

`useOverlayEnvelope` (`lib/theming/envelope.ts`) is the shared appear/hold/disappear clock. Use
it rather than a hand-rolled `interpolate`: it is span-aware, so a short item degrades smoothly
instead of being hard-cut mid-hold or throwing on a non-monotonic input range.

### 3.2 The registration — the ONE declaration

```ts
// src/config/composition-theme.tsx
import type { CompositionTheme } from '@video-toolkit/lib/theming';
import { Ticker } from '../overlays/Ticker';

export const compositionTheme: CompositionTheme = {
  ...brandTheme,
  background: '#0a0a0a',
  overlays: {
    ...brandTheme.overlays,
    ticker: {
      // `render`, not `renderer`: `ticker` is not a core text kind — see §2.
      render: (item) => <Ticker item={item} />,
      // routing defaults to 'track': its own Sequence over [startMs, endMs).
      config: { fontFamily: 'JetBrains Mono, monospace' },
      // THE editor declaration. `type` is required for any field an item may
      // not carry yet — see §3.4.
      params: [
        { prop: 'text', label: 'Ticker text', type: 'string' },
        { prop: 'speed', label: 'Speed (px/frame)', type: 'number' },
      ],
    },
  },
};
```

That is the whole render side. The kind draws immediately; nothing in core enumerates `ticker`.

### 3.3 The editor — derive, do not restate

The editor host takes an optional `meta`. Derive it from the same theme:

```tsx
// .editor/main.tsx
import { mountEditorHost } from '@video-toolkit/lib/editor/host/mount';
import { editorMetaFromTheme } from '@video-toolkit/lib/editor/app/editor-meta';
import { LayeredCampaignReel } from '../src/LayeredCampaignReel';
import { compositionTheme } from '../src/config/composition-theme';
import { fps, width, height } from '../src/config/reel-config';
import '../src/styles/global.css';

mountEditorHost({
  component: LayeredCampaignReel,
  projectName: 'my-project',
  fps,
  width,
  height,
  accentSlots: compositionTheme.accentSlots,
  meta: editorMetaFromTheme(compositionTheme),
});
```

`editorMetaFromTheme(theme, explicit?)` (`lib/editor/app/editor-meta.ts:134`) walks
`theme.video`, the merged overlay registry and `theme.effects`, and turns every declared
`params` into inspector fields. An `explicit` second argument is merged **per kind, not per
axis** — an explicit `videoProps.outro` overrides the derived outro while every other kind stays
derived; on the effect catalog the explicit entry wins on a `type` collision.

The inspector now shows a labelled *Ticker text* string input and a *Speed* number input for
every `ticker` item. Core UI knows nothing about `ticker`.

**`meta` must be a STABLE reference** (`EditorHost.tsx:30-35`). The call above is fine because
`mountEditorHost` runs once at module scope, so `editorMetaFromTheme(...)` is evaluated once. Do
**not** move it into a component body without `useMemo`, and never write an inline
`meta={{ … }}` literal: `LayeredTimeline` is `memo`ized with a shallow compare and re-renders on
every playhead frame, and a fresh object each render defeats the memo entirely.

### 3.4 Declare `type` — the one real footgun

`ParamField` (`registry.ts:26`) types a field by: `options` (a dropdown over exactly those
values) → else `type` → else **the type of the value the item currently holds**.

So a field the item may not carry yet **must** declare `type`. With neither `options` nor
`type`, an absent key has no value to be typed from, the inspector falls back to a text input,
and it writes a **string** into what the renderer expects to be a number (`speed: "4"`). The
content bag is `z.record(z.unknown())`, so nothing rejects it — the config just goes type-dirty
until a reload re-types the field from its now-string value.

**Declaration is additive, per field.** A brand declaring one param on a kind that also
carries `reveal`/`hide`/`fontSize` keeps core's typed editors for those three
(`LayeredInspector.tsx:660-663`, six tests). Only a field the brand names is taken over, and
it then renders through the brand's own `options`/`type` — the same explicit-wins rule
`editorMetaFromTheme` applies. Once anything is declared, the kind's remaining undeclared keys
surface in the generic bag editor too; a kind with no declaration at all keeps exactly today's
inspector. (This was all-or-nothing per kind until `3af9b3a`; a doc claiming otherwise predates
that fix.)

**Known limits of the derived path**, disclosed rather than hidden:

- `BrandTheme.brand` registrations may carry `params`, but the **brand lane has no param UI** —
  they are not derived. "Any registered kind is editable" does not reach that axis yet.
- A derived **effect** entry carries no label or defaults (`Registration` has no such fields):
  it shows as its raw type and adds as a bare `{ type }`.

### 3.5 Verify

```bash
cd <project> && npx tsc --noEmit     # the registration typechecks; a typo'd `render` fails here
npm run studio                       # the kind draws
npm run editor                       # the inspector shows the declared fields
```
