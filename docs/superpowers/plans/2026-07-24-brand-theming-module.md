# Brand Theming Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reel Text overlay's accent palette brand-driven (roost shows gold/rust/green, campaign keeps lime/teal), encapsulated in a reusable core `lib/theming/` module with a generic-or-brand-custom renderer switch.

**Architecture:** A new core module `lib/theming/` owns the accent palette (`AccentSlot` + resolver), the shared `Placement` geometry (lifted from campaign), a `BrandTheme` contract with a per-kind renderer+config registry, and a `resolveOverlayRenderer` switch that returns the brand-custom renderer or a core generic fallback. `TextOverlayBase` gains palette resolution. The editor's `AccentEditor` renders brand slots (swatch+label); the brand's root composition threads `palette` + `config` into whichever renderer draws each text overlay. Roost's `Text` adopts the renderer contract directly; campaign's `QuotePullOverlay` integrates shallowly via an adapter to stay back-compatible with its legacy `PhotoSegment` caller.

**Tech Stack:** TypeScript, React, Remotion, Zod (reel schema), Vitest (`npm test` in `lib/editor`), Remotion `still` for render verification.

## Global Constraints

- **Editor strings are English** (visible UI text), even though we converse in Czech.
- **Accent markup syntax `{key:phrase}` is unchanged**; only the *set* of valid slot keys is brand-supplied. PP keeps `lime`/`teal`; roost adds `gold`/`rust`/`green`.
- **No visual regression:** PP's decoder-scramble + per-line pills and roost's cream-stroke + spring-rise are preserved.
- **`localFrame`/`totalFrames`/`fps` come from Remotion hooks inside a renderer** (mounted in a Sequence), never as root-passed props. `OverlayRenderProps` carries only static props + `appearAtMs`/`durationMs`.
- **Positioning reuses the existing item-level `OverlayItem.position`** field and the existing inspector dropdown — no new content field, no dropdown change. `placementGeometry` falls back to `DEFAULT_PLACEMENT` for unrecognized values.
- **Deferred (do NOT touch):** schema-enum accent fields (`stat-callout.color`, `wipe.color`); the endpoint (`.`) rule (`applyBrandEndpoint` stays default `'teal'` for campaign); other overlay kinds.
- **Commits:** core repo unsigned is fine, no `Co-Authored-By`. Brand repos (roost/campaign `video-toolkit`) enforce 1Password SSH signing — try the signed commit (wrap in ~15s timeout); if it fails on the 1Password buffer error, fall back to `-c commit.gpgsign=false`.
- **Submodule pointers are not committed** in brand repos (leave `toolkit` / `M toolkit` unstaged).
- **Node:** use `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"` for renders when node@20 is needed.

## Repos & paths

- **core:** `/Users/xaralis/Workspace/progpce/core`
- **campaign:** `/Users/xaralis/Workspace/progpce/video-toolkit`
- **roost:** `/Users/xaralis/Workspace/roost/video-toolkit`

Core tests run from `/Users/xaralis/Workspace/progpce/core/lib/editor` via `npm test` (Vitest). The theming module tests live under `lib/theming/` and are picked up by the same Vitest config (it globs `lib/**/*.test.ts(x)`); verify with the exact commands in each task.

---

## Stage A — Core theming module + editor

### Task A1: Accent palette — `palette.ts`

**Files:**
- Create: `lib/theming/palette.ts`
- Test: `lib/theming/palette.test.ts`

**Interfaces:**
- Produces: `interface AccentSlot { key: string; label: string; color: string }`; `paletteMap(slots: AccentSlot[]): Record<string,string>`; `resolveAccentColor(slots: AccentSlot[], key: string | null): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/theming/palette.test.ts
import { describe, it, expect } from 'vitest';
import { paletteMap, resolveAccentColor, type AccentSlot } from './palette';

const SLOTS: AccentSlot[] = [
  { key: 'gold', label: 'Gold', color: '#f6aa1c' },
  { key: 'rust', label: 'Rust', color: '#7b190a' },
];

describe('paletteMap', () => {
  it('builds a key→hex lookup', () => {
    expect(paletteMap(SLOTS)).toEqual({ gold: '#f6aa1c', rust: '#7b190a' });
  });
});

describe('resolveAccentColor', () => {
  it('resolves a known key to its hex', () => {
    expect(resolveAccentColor(SLOTS, 'gold')).toBe('#f6aa1c');
  });
  it('returns null for an unknown key', () => {
    expect(resolveAccentColor(SLOTS, 'lime')).toBeNull();
  });
  it('returns null for a null key (unaccented run)', () => {
    expect(resolveAccentColor(SLOTS, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run ../theming/palette.test.ts`
Expected: FAIL — cannot find module `./palette`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/theming/palette.ts

/** One brand-declared accent slot: the {key:…} markup key, its editor label,
 *  and the hex color an accented run renders in. */
export interface AccentSlot {
  key: string;
  label: string;
  color: string;
}

/** Build a key→hex lookup from a brand's slots. */
export function paletteMap(slots: AccentSlot[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of slots) map[s.key] = s.color;
  return map;
}

/** Resolve one accent key to its hex, or null when the key is unknown or the
 *  run is unaccented (key === null). */
export function resolveAccentColor(slots: AccentSlot[], key: string | null): string | null {
  if (key === null) return null;
  return paletteMap(slots)[key] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run ../theming/palette.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/xaralis/Workspace/progpce/core
git add lib/theming/palette.ts lib/theming/palette.test.ts
git commit -m "feat(theming): AccentSlot palette + resolver"
```

---

### Task A2: Shared placement — `placement.ts`

Lift campaign's `QuotePullOverlay.PLACEMENT` geometry into core so the generic renderer and campaign both use one map.

**Files:**
- Create: `lib/theming/placement.ts`
- Test: `lib/theming/placement.test.ts`

**Interfaces:**
- Produces: `type Placement` (11 values); `interface PlacementGeometry { containerStyle: CSSProperties; textAlign: 'left'|'right'|'center' }`; `placementGeometry(p: Placement): PlacementGeometry`; `const DEFAULT_PLACEMENT: Placement = 'center'`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/theming/placement.test.ts
import { describe, it, expect } from 'vitest';
import { placementGeometry, DEFAULT_PLACEMENT, type Placement } from './placement';

const ALL: Placement[] = [
  'upper-third', 'center', 'lower-third',
  'upper-left', 'upper-center', 'upper-right',
  'mid-left', 'mid-right',
  'lower-left', 'lower-center', 'lower-right',
];

describe('placementGeometry', () => {
  it('returns geometry for every placement value', () => {
    for (const p of ALL) {
      const g = placementGeometry(p);
      expect(g.containerStyle).toBeTypeOf('object');
      expect(['left', 'right', 'center']).toContain(g.textAlign);
    }
  });
  it('anchors right-side zones to the right and left-align them', () => {
    expect(placementGeometry('upper-right').textAlign).toBe('right');
    expect(placementGeometry('mid-left').textAlign).toBe('left');
  });
  it('falls back to the default placement for an unknown value', () => {
    const unknown = placementGeometry('bottom-left' as Placement);
    expect(unknown).toEqual(placementGeometry(DEFAULT_PLACEMENT));
  });
  it('defaults to center', () => {
    expect(DEFAULT_PLACEMENT).toBe('center');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run ../theming/placement.test.ts`
Expected: FAIL — cannot find module `./placement`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// lib/theming/placement.ts
import type { CSSProperties } from 'react';

/** The shared overlay positioning vocabulary — 3 full-width bands + 8 anchored
 *  zones — lifted from campaign's QuotePullOverlay so every renderer positions
 *  by the same set. */
export type Placement =
  | 'upper-third' | 'center' | 'lower-third'
  | 'upper-left' | 'upper-center' | 'upper-right'
  | 'mid-left' | 'mid-right'
  | 'lower-left' | 'lower-center' | 'lower-right';

export interface PlacementGeometry {
  containerStyle: CSSProperties;
  textAlign: 'left' | 'right' | 'center';
}

export const DEFAULT_PLACEMENT: Placement = 'center';

// Anchored *-right / *-center zones sit at top >= 18–20% to clear the top-right
// logo zone; anchored variants cap max-width at 56% so they stay in their half.
const PLACEMENT: Record<Placement, PlacementGeometry> = {
  'upper-third':  { containerStyle: { top: '24%', left: '6%', right: '6%' }, textAlign: 'center' },
  'center':       { containerStyle: { top: '46%', left: '6%', right: '6%' }, textAlign: 'center' },
  'lower-third':  { containerStyle: { top: '58%', left: '6%', right: '6%' }, textAlign: 'center' },
  'upper-left':   { containerStyle: { top: '20%', left: '6%',  maxWidth: '56%' }, textAlign: 'left'  },
  'upper-center': { containerStyle: { top: '20%', left: '6%',  right: '6%'     }, textAlign: 'center' },
  'upper-right':  { containerStyle: { top: '20%', right: '6%', maxWidth: '56%' }, textAlign: 'right' },
  'mid-left':     { containerStyle: { top: '44%', left: '6%',  maxWidth: '56%' }, textAlign: 'left'  },
  'mid-right':    { containerStyle: { top: '44%', right: '6%', maxWidth: '56%' }, textAlign: 'right' },
  'lower-left':   { containerStyle: { top: '60%', left: '6%',  maxWidth: '56%' }, textAlign: 'left'  },
  'lower-center': { containerStyle: { top: '60%', left: '6%',  right: '6%'     }, textAlign: 'center' },
  'lower-right':  { containerStyle: { top: '60%', right: '6%', maxWidth: '56%' }, textAlign: 'right' },
};

/** Geometry for a placement; unknown values fall back to DEFAULT_PLACEMENT. */
export function placementGeometry(p: Placement): PlacementGeometry {
  return PLACEMENT[p] ?? PLACEMENT[DEFAULT_PLACEMENT];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run ../theming/placement.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/xaralis/Workspace/progpce/core
git add lib/theming/placement.ts lib/theming/placement.test.ts
git commit -m "feat(theming): shared Placement geometry (lifted from campaign)"
```

---

### Task A3: Renderer contract types + generic renderer

**Files:**
- Create: `lib/theming/types.ts`, `lib/theming/generic/GenericTextOverlay.tsx`
- Test: `lib/theming/generic/GenericTextOverlay.test.tsx`

**Interfaces:**
- Consumes: `AccentSlot` (A1), `Placement` (A2).
- Produces: `interface OverlayRenderProps`; `type OverlayRenderer = React.FC<OverlayRenderProps>`; `type OverlayKind = 'text'`; `interface OverlayRegistration { renderer: OverlayRenderer; config?: unknown }`; `interface BrandTheme { accentSlots: AccentSlot[]; overlays?: Partial<Record<OverlayKind, OverlayRegistration>> }`; `const GenericTextOverlay: OverlayRenderer`.

- [ ] **Step 1: Write the failing test**

```tsx
// lib/theming/generic/GenericTextOverlay.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GenericTextOverlay } from './GenericTextOverlay';
import type { AccentSlot } from '../palette';

// Remotion hooks need a composition context; the generic renderer must not call
// any (it is static), so it renders fine bare.
const SLOTS: AccentSlot[] = [{ key: 'gold', label: 'Gold', color: '#f6aa1c' }];

describe('GenericTextOverlay', () => {
  it('renders plain text with accents stripped and no animation', () => {
    const { container } = render(
      <GenericTextOverlay
        text={'Hello {gold:World}.'}
        placement="center"
        palette={SLOTS}
        appearAtMs={0}
        durationMs={2000}
      />,
    );
    // Accent braces gone, no colored span — just the plain concatenated text.
    expect(container.textContent).toBe('Hello World.');
    expect(container.querySelector('[data-accent]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run ../theming/generic/GenericTextOverlay.test.tsx`
Expected: FAIL — cannot find module `./GenericTextOverlay`.

- [ ] **Step 3: Write minimal implementation**

First the shared types:

```tsx
// lib/theming/types.ts
import type { AccentSlot } from './palette';
import type { Placement } from './placement';

/** The static prop bag every text-overlay renderer receives. Frame-derived
 *  values (localFrame/totalFrames/fps) are read from Remotion hooks INSIDE the
 *  renderer's Sequence, not passed here. */
export interface OverlayRenderProps {
  text: string;
  placement: Placement;
  fontSize?: number;
  reveal?: 'line' | 'all';
  /** Brand palette; renderers resolve keys→hex via paletteMap/resolveAccentColor. */
  palette: AccentSlot[];
  /** Opaque brand-level config threaded down by the root from the theme. */
  config?: unknown;
  /** Usually 0 — the overlay is mounted in a Sequence at the item's start. */
  appearAtMs: number;
  durationMs: number;
}

export type OverlayRenderer = React.FC<OverlayRenderProps>;

/** Overlay kinds that flow through the theming module. Widened as kinds adopt it. */
export type OverlayKind = 'text';

/** One kind's brand registration: its custom renderer + opaque brand config. */
export interface OverlayRegistration {
  renderer: OverlayRenderer;
  config?: unknown;
}

/** The theming contract a brand's theme object satisfies. */
export interface BrandTheme {
  accentSlots: AccentSlot[];
  /** Per-kind brand-custom renderer + config. Absent kind → core generic. */
  overlays?: Partial<Record<OverlayKind, OverlayRegistration>>;
}
```

Then the generic renderer:

```tsx
// lib/theming/generic/GenericTextOverlay.tsx
import type { OverlayRenderProps } from '../types';
import { placementGeometry } from '../placement';
import { parseAccents } from '../../transcripts/accent-parser';

/** Core default text renderer: positioned plain text, sane defaults, NO accent
 *  coloring and NO animation. The fallback when a brand registers no custom
 *  text renderer. */
export const GenericTextOverlay: React.FC<OverlayRenderProps> = ({ text, placement, fontSize = 64 }) => {
  const plain = parseAccents(text).map((t) => t.text).join('');
  const geo = placementGeometry(placement);
  return (
    <div
      style={{
        position: 'absolute',
        ...geo.containerStyle,
        transform: 'translateY(-50%)',
        textAlign: geo.textAlign,
        color: '#ffffff',
        fontFamily: 'sans-serif',
        fontWeight: 700,
        fontSize,
        lineHeight: 1.3,
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
      }}
    >
      {plain}
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run ../theming/generic/GenericTextOverlay.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd /Users/xaralis/Workspace/progpce/core
git add lib/theming/types.ts lib/theming/generic/GenericTextOverlay.tsx lib/theming/generic/GenericTextOverlay.test.tsx
git commit -m "feat(theming): OverlayRenderProps contract + GenericTextOverlay"
```

---

### Task A4: Renderer resolution + module barrel — `brand-theme.ts`, `index.ts`

**Files:**
- Create: `lib/theming/brand-theme.ts`, `lib/theming/index.ts`
- Test: `lib/theming/brand-theme.test.tsx`

**Interfaces:**
- Consumes: types (A3), `GenericTextOverlay` (A3).
- Produces: `resolveOverlayRenderer(theme: BrandTheme, kind: OverlayKind): OverlayRenderer`; `overlayConfig(theme: BrandTheme, kind: OverlayKind): unknown`. `index.ts` re-exports palette, placement, types, and these functions.

- [ ] **Step 1: Write the failing test**

```tsx
// lib/theming/brand-theme.test.tsx
import { describe, it, expect } from 'vitest';
import { resolveOverlayRenderer, overlayConfig } from './brand-theme';
import { GenericTextOverlay } from './generic/GenericTextOverlay';
import type { BrandTheme, OverlayRenderProps } from './types';

const CustomText: React.FC<OverlayRenderProps> = () => null;

describe('resolveOverlayRenderer', () => {
  it('returns the brand-custom renderer when registered', () => {
    const theme: BrandTheme = {
      accentSlots: [],
      overlays: { text: { renderer: CustomText, config: { a: 1 } } },
    };
    expect(resolveOverlayRenderer(theme, 'text')).toBe(CustomText);
  });
  it('falls back to the core generic when the kind is not registered', () => {
    const theme: BrandTheme = { accentSlots: [] };
    expect(resolveOverlayRenderer(theme, 'text')).toBe(GenericTextOverlay);
  });
});

describe('overlayConfig', () => {
  it('returns the registered config, or undefined when none', () => {
    const withCfg: BrandTheme = { accentSlots: [], overlays: { text: { renderer: CustomText, config: { a: 1 } } } };
    const noCfg: BrandTheme = { accentSlots: [] };
    expect(overlayConfig(withCfg, 'text')).toEqual({ a: 1 });
    expect(overlayConfig(noCfg, 'text')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run ../theming/brand-theme.test.tsx`
Expected: FAIL — cannot find module `./brand-theme`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// lib/theming/brand-theme.ts
import type { BrandTheme, OverlayKind, OverlayRenderer } from './types';
import { GenericTextOverlay } from './generic/GenericTextOverlay';

// Core generic fallback per kind. GenericTextOverlay imports only TYPES from
// ./types (erased at runtime), so this runtime edge is one-directional — no cycle.
const GENERIC_RENDERERS: Record<OverlayKind, OverlayRenderer> = {
  text: GenericTextOverlay,
};

/** The "generic OR brand-custom" switch: the brand's registered renderer for a
 *  kind, else the core generic fallback. */
export function resolveOverlayRenderer(theme: BrandTheme, kind: OverlayKind): OverlayRenderer {
  return theme.overlays?.[kind]?.renderer ?? GENERIC_RENDERERS[kind];
}

/** The brand config registered for a kind (undefined when none). */
export function overlayConfig(theme: BrandTheme, kind: OverlayKind): unknown {
  return theme.overlays?.[kind]?.config;
}
```

```ts
// lib/theming/index.ts
export { paletteMap, resolveAccentColor, type AccentSlot } from './palette';
export { placementGeometry, DEFAULT_PLACEMENT, type Placement, type PlacementGeometry } from './placement';
export type { OverlayRenderProps, OverlayRenderer, OverlayKind, OverlayRegistration, BrandTheme } from './types';
export { resolveOverlayRenderer, overlayConfig } from './brand-theme';
export { GenericTextOverlay } from './generic/GenericTextOverlay';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run ../theming/brand-theme.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/xaralis/Workspace/progpce/core
git add lib/theming/brand-theme.ts lib/theming/index.ts lib/theming/brand-theme.test.tsx
git commit -m "feat(theming): resolveOverlayRenderer + overlayConfig + barrel"
```

---

### Task A5: `TextOverlayBase` resolves palette keys → hex

Add an optional `palette` prop; when present, each token's `color` is resolved from key to hex, so brand render props consume ready hex. Absent → unchanged (back-compat).

**Files:**
- Modify: `lib/components/TextOverlay.tsx`
- Test: `lib/components/TextOverlay.test.tsx` (create)

**Interfaces:**
- Consumes: `AccentSlot`, `resolveAccentColor` (A1).
- Produces: `TextOverlayBaseProps` gains `palette?: AccentSlot[]`. `TextRenderCtx.tokens[].color` is hex (or null) when `palette` is passed.

- [ ] **Step 1: Write the failing test**

```tsx
// lib/components/TextOverlay.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Composition, getRemotionEnvironment } from 'remotion';
import { TextOverlayBase, type TextRenderCtx } from './TextOverlay';
import type { AccentSlot } from '../theming/palette';

const SLOTS: AccentSlot[] = [{ key: 'gold', label: 'Gold', color: '#f6aa1c' }];

// A tiny harness: render the base inside a Remotion composition frame so its
// useCurrentFrame/useVideoConfig resolve. We assert on the token colors it hands
// the render prop.
function captureTokens(palette?: AccentSlot[]): TextRenderCtx {
  let captured!: TextRenderCtx;
  render(
    <Composition
      id="t"
      durationInFrames={60}
      fps={30}
      width={100}
      height={100}
      component={() => (
        <TextOverlayBase
          text={'a {gold:b}'}
          appearAtMs={0}
          durationMs={2000}
          applyEndpoint={false}
          palette={palette}
          render={(ctx) => {
            captured = ctx;
            return null;
          }}
        />
      )}
    />,
  );
  return captured;
}

describe('TextOverlayBase palette resolution', () => {
  it('resolves token accent keys to hex when a palette is passed', () => {
    // NOTE: if the Composition harness does not tick a frame in your test env,
    // replace with @remotion/player's renderFrames or a thin useCurrentFrame mock.
    const ctx = captureTokens(SLOTS);
    const gold = ctx.tokens.find((t) => t.text === 'b');
    expect(gold?.color).toBe('#f6aa1c');
  });
  it('leaves the accent key as-is when no palette is passed (back-compat)', () => {
    const ctx = captureTokens(undefined);
    const gold = ctx.tokens.find((t) => t.text === 'b');
    expect(gold?.color).toBe('gold');
  });
});
```

> Implementer note: `TextOverlayBase` returns `null` for frames outside its
> window and needs `useCurrentFrame`/`useVideoConfig`. If the `Composition`
> harness above does not drive a frame in this repo's Vitest setup, render the
> base through the existing pattern used by `lib/editor/app/*.test.tsx` (they
> wrap Remotion components) — mirror whichever harness those tests use. The
> assertions on `ctx.tokens[].color` are the contract; keep them.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run ../components/TextOverlay.test.tsx`
Expected: FAIL — `palette` prop not applied; `b` color is `'gold'` even with a palette.

- [ ] **Step 3: Write minimal implementation**

Edit `lib/components/TextOverlay.tsx`:

Add the import at the top (after the existing accent-parser import):

```tsx
import { resolveAccentColor, type AccentSlot } from '../theming/palette';
```

Extend `TextOverlayBaseProps` with the optional palette:

```tsx
export interface TextOverlayBaseProps {
  text: string;
  appearAtMs: number;
  durationMs: number;
  applyEndpoint?: boolean;
  /** When present, token color KEYS are resolved to hex via this palette; when
   *  absent, tokens keep their raw accent key (back-compat). */
  palette?: AccentSlot[];
  render: (ctx: TextRenderCtx) => React.ReactNode;
}
```

Update the function signature and token construction:

```tsx
export function TextOverlayBase({ text, appearAtMs, durationMs, applyEndpoint = true, palette, render }: TextOverlayBaseProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = Math.round((appearAtMs / 1000) * fps);
  const end = start + Math.round((durationMs / 1000) * fps);
  if (frame < start || frame > end) return null;

  const source = applyEndpoint ? applyBrandEndpoint(text) : text;
  const parsed = parseAccents(source).map((t) => ({ text: t.text, color: t.color })) as TextToken[];
  const tokens: TextToken[] = palette
    ? parsed.map((t) => ({ text: t.text, color: resolveAccentColor(palette, t.color) }))
    : parsed;
  return <>{render({ tokens, lines: splitLines(tokens), text: source, localFrame: frame - start, totalFrames: end - start, fps })}</>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run ../components/TextOverlay.test.tsx`
Expected: PASS (2 tests). If the Composition harness can't tick, adapt per the implementer note, keeping the color assertions.

- [ ] **Step 5: Commit**

```bash
cd /Users/xaralis/Workspace/progpce/core
git add lib/components/TextOverlay.tsx lib/components/TextOverlay.test.tsx
git commit -m "feat(theming): TextOverlayBase resolves accent keys→hex via palette"
```

---

### Task A6: `AccentEditor` — brand slots with swatches + inline colors

**Files:**
- Modify: `lib/editor/app/AccentEditor.tsx`, `lib/editor/app/AccentEditor.module.css`
- Test: `lib/editor/app/AccentEditor.test.tsx` (extend existing)

**Interfaces:**
- Consumes: `AccentSlot` (A1).
- Produces: `AccentEditorColor` is `AccentSlot` (`{ key; label; color }`). `AccentEditor` `colors` prop typed `AccentSlot[]`; renders a swatch per button and colors accent spans inline from the slot color.

- [ ] **Step 1: Write the failing test**

Append to `lib/editor/app/AccentEditor.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccentEditor } from './AccentEditor';

describe('AccentEditor brand palette', () => {
  it('renders one button per supplied slot with its label', () => {
    render(
      <AccentEditor
        value="Kavárna Nota"
        onChange={() => {}}
        colors={[
          { key: 'gold', label: 'Gold', color: '#f6aa1c' },
          { key: 'rust', label: 'Rust', color: '#7b190a' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /Gold/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Rust/ })).toBeTruthy();
    // The PP defaults must NOT appear when a brand palette is supplied.
    expect(screen.queryByRole('button', { name: /Lime/ })).toBeNull();
  });

  it('colors an accent span with the slot hex', () => {
    const { container } = render(
      <AccentEditor
        value={'a {gold:b}'}
        onChange={() => {}}
        colors={[{ key: 'gold', label: 'Gold', color: '#f6aa1c' }]}
      />,
    );
    const span = container.querySelector('[data-accent="gold"]') as HTMLElement;
    expect(span).toBeTruthy();
    expect(span.style.color).toBe('rgb(246, 170, 28)'); // #f6aa1c
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run app/AccentEditor.test.tsx`
Expected: FAIL — buttons lack the swatch/label wiring or spans have no inline color (they use CSS classes today).

- [ ] **Step 3: Write minimal implementation**

Edit `lib/editor/app/AccentEditor.tsx`:

Replace the color type + defaults (top of file) — reuse `AccentSlot` so the editor and theming share one shape:

```tsx
import type { AccentSlot } from '../../theming/palette';

/** The editor's accent palette entry IS a brand accent slot. */
export type AccentEditorColor = AccentSlot;

const DEFAULT_COLORS: AccentEditorColor[] = [
  { key: 'lime', label: 'Lime', color: '#c6f432' },
  { key: 'teal', label: 'Teal', color: '#2ad4c5' },
];
```

Change `renderInto` to color spans inline from a key→hex map instead of CSS classes:

```tsx
/** Renders `value` into `root` as text nodes + accent spans (colored inline). */
function renderInto(root: HTMLElement, value: string, colorMap: Record<string, string>): void {
  const doc = root.ownerDocument;
  root.textContent = '';
  for (const run of parseAccents(value)) {
    if (run.text === '') continue;
    if (run.color === null) {
      root.appendChild(doc.createTextNode(run.text));
    } else {
      const span = doc.createElement('span');
      span.setAttribute('data-accent', run.color);
      const hex = colorMap[run.color];
      if (hex) span.style.color = hex;
      span.style.fontWeight = '600';
      span.textContent = run.text;
      root.appendChild(span);
    }
  }
}
```

In the component, build the color map and pass it to every `renderInto` call, and render swatches in the buttons. Update the component body:

```tsx
export function AccentEditor({ value, onChange, colors = DEFAULT_COLORS, multiline = false }: AccentEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string | null>(null);
  const colorMap = useMemo(() => Object.fromEntries(colors.map((c) => [c.key, c.color])), [colors]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (lastValue.current === value) return;
    renderInto(el, value, colorMap);
    lastValue.current = value;
  }, [value, colorMap]);
```

(There are two other `renderInto(el, next)` call sites — in `applyColor`; change both to `renderInto(el, next, colorMap)`.)

Add `useMemo` to the React import at the top:

```tsx
import { useLayoutEffect, useMemo, useRef } from 'react';
```

Update the toolbar buttons to show a swatch:

```tsx
{colors.map((c) => (
  <button
    key={c.key}
    type="button"
    className={styles.button}
    data-accent-button={c.key}
    onMouseDown={(e) => e.preventDefault()}
    onClick={() => applyColor(c.key)}
  >
    <span
      aria-hidden="true"
      style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: c.color, marginRight: 6, verticalAlign: 'middle' }}
    />
    {c.label}
  </button>
))}
```

Edit `lib/editor/app/AccentEditor.module.css`: delete the `.lime` and `.teal` blocks at the bottom (spans are colored inline now). Leave `.editor`, `.toolbar`, `.button`, `.content`, and their hover/focus rules unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run app/AccentEditor.test.tsx`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/xaralis/Workspace/progpce/core
git add lib/editor/app/AccentEditor.tsx lib/editor/app/AccentEditor.module.css lib/editor/app/AccentEditor.test.tsx
git commit -m "feat(editor): AccentEditor renders brand slots with swatches + inline colors"
```

---

### Task A7: `LayeredInspector` threads `accentSlots` to `AccentEditor`

**Files:**
- Modify: `lib/editor/app/LayeredInspector.tsx`
- Test: `lib/editor/app/LayeredInspector.test.tsx` (extend existing)

**Interfaces:**
- Consumes: `AccentSlot` (A1), `AccentEditor` `colors` prop (A6).
- Produces: `LayeredInspector` gains optional prop `accentSlots?: AccentSlot[]`, passed to `AccentEditor` as `colors`.

- [ ] **Step 1: Write the failing test**

Append to `lib/editor/app/LayeredInspector.test.tsx` (mirror the existing test's reel fixture + render helper; the key assertion is that supplied slots reach the buttons):

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LayeredInspector } from './LayeredInspector';

// Minimal reel with one selected text overlay. Reuse the shape from the file's
// existing fixtures if present; otherwise this inline one suffices.
const reel = {
  version: 'layered-1',
  meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [], audio: [], music: { source: '', baseVolumeDb: -8 }, brand: [],
    overlays: [{ id: 'ov1', startMs: 0, endMs: 2000, content: { kind: 'text', text: 'Hi' } }],
  },
} as never;

describe('LayeredInspector accentSlots', () => {
  it('passes the brand slots to the AccentEditor toolbar', () => {
    render(
      <LayeredInspector
        reel={reel}
        selectedId="overlays:ov1"
        onChange={() => {}}
        onSeek={() => {}}
        fps={30}
        accentSlots={[{ key: 'gold', label: 'Gold', color: '#f6aa1c' }]}
      />,
    );
    expect(screen.getByRole('button', { name: /Gold/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Lime/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run app/LayeredInspector.test.tsx`
Expected: FAIL — `accentSlots` not a prop; AccentEditor still shows default Lime/Teal.

- [ ] **Step 3: Write minimal implementation**

Edit `lib/editor/app/LayeredInspector.tsx`:

Add the import:

```tsx
import type { AccentSlot } from '../../theming/palette';
```

Add `accentSlots` to the component's props type and destructuring. The existing signature is `export function LayeredInspector({ reel, selectedId, onChange, onSeek, fps }: LayeredInspectorProps)` with a `LayeredInspectorProps` interface — add:

```tsx
  /** Brand accent palette for the text AccentEditor. */
  accentSlots?: AccentSlot[];
```

to `LayeredInspectorProps`, and include `accentSlots` in the destructuring.

Pass it to the `AccentEditor` (the call at ~line 419):

```tsx
<AccentEditor value={content.text ?? ''} onChange={(next) => patchContent({ text: next })} colors={accentSlots} multiline />
```

(When `accentSlots` is undefined, `AccentEditor` falls back to its `DEFAULT_COLORS`, so campaign behavior before its host is wired is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run app/LayeredInspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full core suite + commit**

Run: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npm test`
Expected: all tests pass (previously 331 + the new theming/editor tests).

```bash
cd /Users/xaralis/Workspace/progpce/core
git add lib/editor/app/LayeredInspector.tsx lib/editor/app/LayeredInspector.test.tsx
git commit -m "feat(editor): LayeredInspector threads accentSlots to AccentEditor"
```

---

## Stage B — Roost wiring + render verification

> All roost paths are under `/Users/xaralis/Workspace/roost/video-toolkit`. Roost consumes core via the `toolkit/` submodule (alias `@video-toolkit/lib`). Before Stage B, local-fetch core into the roost submodule so the new `lib/theming/` resolves:
> ```bash
> cd /Users/xaralis/Workspace/roost/video-toolkit
> git -C toolkit fetch /Users/xaralis/Workspace/progpce/core feat/reel-editor-skeleton
> git -C toolkit checkout --detach FETCH_HEAD
> ```

### Task B1: Roost `theme.ts` — add `accentSlots`

**Files:**
- Modify: `templates/roost-reels/src/config/theme.ts`

**Interfaces:**
- Produces: `theme.accentSlots: AccentSlot[]` (gold/rust/green) — pure data, no component imports (so no import cycle with the renderer).

- [ ] **Step 1: Add `accentSlots` to roost `theme.ts`**

In `templates/roost-reels/src/config/theme.ts`, add an `accentSlots` array to the exported `theme` object (after `colors`):

```ts
  accentSlots: [
    { key: 'gold',  label: 'Gold',  color: '#f6aa1c' },
    { key: 'rust',  label: 'Rust',  color: '#7b190a' },
    { key: 'green', label: 'Green', color: '#334f14' },
  ],
```

- [ ] **Step 2: Commit** (deferred — commit with B3, once `brand-theme.ts` + the renderer wiring exist and render end-to-end).

> `brand-theme.ts` (which imports the `Text` renderer) is created in Task B3, **after** Task B2 makes `Text` conform to `OverlayRenderProps` — so the registration references a contract-correct renderer.

### Task B2: Roost `Text` adopts `OverlayRenderProps` + honors accents

**Files:**
- Modify: `templates/roost-reels/src/overlays/TextOverlay.tsx`

**Interfaces:**
- Consumes: `OverlayRenderProps` (A3), `TextOverlayBase` `palette` prop (A5).
- Produces: `Text: React.FC<OverlayRenderProps>` — colors each token with its resolved hex (default paper), reads `strokeRatio`/`lineStaggerSec` from `config`. Keeps `roostTextFrames` export.

- [ ] **Step 1: Rewrite the `Text` component**

Replace the current `Text` export in `templates/roost-reels/src/overlays/TextOverlay.tsx`. Keep the file's existing imports of `AbsoluteFill, spring, interpolate` (remotion), `theme`, and `TextOverlayBase, type TextRenderCtx`; add the theming import and swap the component:

```tsx
import type { OverlayRenderProps } from '@video-toolkit/lib/theming';

// (keep LINE_STAGGER_SEC, FADE_SEC, roostTextFrames as-is above)

/** Roost's on-screen text renderer. Conforms to the shared OverlayRenderProps
 *  contract; keeps roost's centred cream-stroke stack + per-line spring rise,
 *  and now colors accented words via the resolved palette (t.color is hex). */
export const Text: React.FC<OverlayRenderProps> = ({
  text,
  fontSize = 96,
  reveal = 'line',
  palette,
  config,
  appearAtMs,
  durationMs,
}) => {
  const cfg = (config ?? {}) as { strokeRatio?: number; lineStaggerSec?: number };
  const strokeRatio = cfg.strokeRatio ?? 0.2;
  const staggerSec = cfg.lineStaggerSec ?? LINE_STAGGER_SEC;
  return (
    <TextOverlayBase
      text={text}
      appearAtMs={appearAtMs}
      durationMs={durationMs}
      applyEndpoint={false}
      palette={palette}
      render={({ lines, localFrame, totalFrames, fps }: TextRenderCtx) => {
        const stagger = reveal === 'line' ? Math.round(staggerSec * fps) : 0;
        const fadeF = Math.round(FADE_SEC * fps);
        const fade = interpolate(localFrame, [totalFrames - fadeF, totalFrames], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const lineStyle: React.CSSProperties = {
          fontFamily: theme.fonts.display,
          fontWeight: 800,
          fontSize,
          lineHeight: 1.4,
          color: theme.colors.paper,
          WebkitTextStroke: `${Math.round(fontSize * strokeRatio)}px ${theme.colors.ink}`,
          paintOrder: 'stroke fill',
          margin: 0,
        };
        return (
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 60px', opacity: fade }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              {lines.map((line, i) => {
                const lStart = i * stagger;
                const rise = spring({ frame: localFrame - lStart, fps, config: { damping: 200 } });
                return (
                  <div key={i} style={{ ...lineStyle, opacity: rise, transform: `translateY(${(1 - rise) * 36}px)` }}>
                    {line.map((t, j) => (
                      <span key={j} style={t.color ? { color: t.color } : undefined}>
                        {t.text}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </AbsoluteFill>
        );
      }}
    />
  );
};
```

Key change vs today: each line renders its tokens as `<span>`s colored by `t.color` (the palette-resolved hex; default paper via `lineStyle.color`), instead of `line.map((t) => t.text).join('')` which stripped accents. `placement` is intentionally unused — roost's teaser is always centered (documented in the component comment).

- [ ] **Step 2: Typecheck**

Run: `cd /Users/xaralis/Workspace/roost/video-toolkit/projects/roost-reel-01 && npx tsc --noEmit 2>&1 | grep -v "Cannot find module '@video-toolkit" | grep "TextOverlay\|brand-theme" || echo "no new errors"`
Expected: `no new errors`.

- [ ] **Step 3: Commit** (still deferred to B3 so the render can be verified end-to-end first).

### Task B3: `LayeredRoostReel` renders the resolved renderer with palette + config

**Files:**
- Modify: `templates/roost-reels/src/LayeredRoostReel.tsx`

**Files (this task):**
- Create: `templates/roost-reels/src/config/brand-theme.ts`
- Modify: `templates/roost-reels/src/LayeredRoostReel.tsx`

**Interfaces:**
- Consumes: `resolveOverlayRenderer`, `overlayConfig`, `DEFAULT_PLACEMENT`, `type Placement`, `type BrandTheme` (theming); `theme.accentSlots` (B1); `Text` as `OverlayRenderProps` (B2).
- Produces: `brandTheme: BrandTheme`; text overlays rendered via `resolveOverlayRenderer(brandTheme,'text')`, threaded `palette={brandTheme.accentSlots}` + `config={overlayConfig(brandTheme,'text')}`.

- [ ] **Step 0: Create `brand-theme.ts`** (now that `Text` conforms to `OverlayRenderProps`)

```ts
// templates/roost-reels/src/config/brand-theme.ts
import type { BrandTheme } from '@video-toolkit/lib/theming';
import { theme } from './theme';
import { Text } from '../overlays/TextOverlay';

/** Roost's theming contract: its accent slots + its custom Text renderer with
 *  roost-specific config (stroke thickness ratio, line-reveal stagger). */
export const brandTheme: BrandTheme = {
  accentSlots: theme.accentSlots,
  overlays: {
    text: { renderer: Text, config: { strokeRatio: 0.2, lineStaggerSec: 0.35 } },
  },
};
```

- [ ] **Step 1: Swap the direct `Text` import + `textNodes`**

Remove `import { Text } from './overlays/TextOverlay';` and add:

```tsx
import { resolveOverlayRenderer, overlayConfig, DEFAULT_PLACEMENT, type Placement } from '@video-toolkit/lib/theming';
import { brandTheme } from './config/brand-theme';
```

Replace the `textNodes` block (currently maps `content.kind === 'text'` and renders `<Text .../>`) with:

```tsx
  // ---- 3. Text overlays → resolved renderer (brand-custom or core generic) ----
  const TextRenderer = resolveOverlayRenderer(brandTheme, 'text');
  const textCfg = overlayConfig(brandTheme, 'text');
  const textNodes = reel.tracks.overlays
    .filter((o: OverlayItem) => (o.content as Record<string, unknown>).kind === 'text')
    .map((o: OverlayItem) => {
      const content = o.content as { text?: string; reveal?: 'line' | 'all'; fontSize?: number };
      const from = msToFrames(o.startMs, fps);
      const durationInFrames = Math.max(1, msToFrames(o.endMs, fps) - from);
      return (
        <Sequence key={o.id} name={o.id} from={from} durationInFrames={durationInFrames}>
          <TextRenderer
            text={content.text ?? ''}
            placement={(o.position as Placement) ?? DEFAULT_PLACEMENT}
            fontSize={content.fontSize}
            reveal={content.reveal}
            palette={brandTheme.accentSlots}
            config={textCfg}
            appearAtMs={0}
            durationMs={o.endMs - o.startMs}
          />
        </Sequence>
      );
    });
```

- [ ] **Step 2: Sync template → project**

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit
cp templates/roost-reels/src/config/theme.ts        projects/roost-reel-01/src/config/theme.ts
cp templates/roost-reels/src/config/brand-theme.ts  projects/roost-reel-01/src/config/brand-theme.ts
cp templates/roost-reels/src/overlays/TextOverlay.tsx projects/roost-reel-01/src/overlays/TextOverlay.tsx
cp templates/roost-reels/src/LayeredRoostReel.tsx   projects/roost-reel-01/src/LayeredRoostReel.tsx
```

- [ ] **Step 3: Render-verify an accented teaser**

Temporarily add an accent to the roost teaser to prove colors render, then render a frame. Edit `projects/roost-reel-01/src/Root.tsx` overlay text to `'Kavárna Nota\n{gold:30. července}\nSee you soon!'` (remember to revert after verifying), then:

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit/projects/roost-reel-01
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
OUT=/private/tmp/claude-502/-Users-xaralis-Workspace-progpce-core/924bb9dc-fb08-4788-b4c2-b893233465ac/scratchpad/roost-accent-f45.png
npx remotion still LayeredRoostReel "$OUT" --frame=45 --gl=angle
```

Expected: renders successfully; the second teaser line shows in gold (`#f6aa1c`) while the other lines stay cream — confirming the palette resolves and roost honors accents. Revert the temporary `Root.tsx` accent edit after confirming.

- [ ] **Step 4: Full-suite + commit (roost)**

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit
git add templates/roost-reels/src/config/theme.ts \
        templates/roost-reels/src/config/brand-theme.ts \
        templates/roost-reels/src/overlays/TextOverlay.tsx \
        templates/roost-reels/src/LayeredRoostReel.tsx \
        projects/roost-reel-01/src/config/theme.ts \
        projects/roost-reel-01/src/config/brand-theme.ts \
        projects/roost-reel-01/src/overlays/TextOverlay.tsx \
        projects/roost-reel-01/src/LayeredRoostReel.tsx
# signed commit; fall back to unsigned only on the 1Password buffer error
timeout 15 git commit -m "feat(roost): text overlay via theming module — brand palette + config" \
  || git -c commit.gpgsign=false commit -m "feat(roost): text overlay via theming module — brand palette + config"
```

### Task B4: Roost editor host passes `accentSlots`

**Files:**
- Modify: `projects/roost-reel-01/.editor/main.tsx`

**Interfaces:**
- Consumes: `brandTheme.accentSlots` (B1); `LayeredInspector` `accentSlots` prop (A7).

- [ ] **Step 1: Import the brand theme + pass slots**

In `projects/roost-reel-01/.editor/main.tsx`, add near the other `../src` imports:

```tsx
import { brandTheme } from '../src/config/brand-theme';
```

Add the prop to the `<LayeredInspector ... />` element:

```tsx
        <LayeredInspector
          reel={reel}
          selectedId={selectedId}
          onChange={setReel}
          onSeek={(f) => playerRef.current?.seekTo(f)}
          fps={fps}
          accentSlots={brandTheme.accentSlots}
        />
```

- [ ] **Step 2: Verify in the editor**

Start the roost editor host and open the inspector for the teaser overlay; the Text accent toolbar shows **Gold / Rust / Green** (with swatches), not Lime/Teal.

Run (background, then check): `cd /Users/xaralis/Workspace/roost/video-toolkit/projects/roost-reel-01 && npm run editor` — load the page, select the teaser overlay, confirm the toolbar labels. Stop the server after confirming.

- [ ] **Step 3: Commit (roost)**

```bash
cd /Users/xaralis/Workspace/roost/video-toolkit
timeout 15 git commit -am "feat(roost): editor host passes brand accentSlots to inspector" \
  || git -c commit.gpgsign=false commit -am "feat(roost): editor host passes brand accentSlots to inspector"
```

(Leave the `toolkit` submodule pointer unstaged.)

---

## Stage C — Campaign wiring + render verification

> All campaign paths are under `/Users/xaralis/Workspace/progpce/video-toolkit`. Campaign consumes core via `toolkit/` too; local-fetch core in the same way if its submodule is behind:
> ```bash
> cd /Users/xaralis/Workspace/progpce/video-toolkit
> git -C toolkit fetch /Users/xaralis/Workspace/progpce/core feat/reel-editor-skeleton && git -C toolkit checkout --detach FETCH_HEAD
> ```

### Task C1: Campaign `theme.ts` — add `accentSlots`

**Files:**
- Modify: `templates/campaign-reels/src/config/theme.ts`

**Interfaces:**
- Produces: `theme.accentSlots` (lime/teal) — pure data.

- [ ] **Step 1: Add `accentSlots` to campaign `theme.ts`**

In `templates/campaign-reels/src/config/theme.ts`, add to the exported `theme` object:

```ts
  accentSlots: [
    { key: 'lime', label: 'Lime', color: '#c6f432' },
    { key: 'teal', label: 'Teal', color: '#2ad4c5' },
  ],
```

- [ ] **Step 2: Commit** (deferred to C3, alongside the adapter + renderer wiring).

> The adapter `brand-theme.ts` (which passes `palette` to `QuotePullOverlay`) is created in Task C3, **after** Task C2 gives `QuotePullOverlay` its `palette` prop.

### Task C2: `QuotePullOverlay` — palette-driven colors + core placement

**Files:**
- Modify: `brand-lib/overlays/QuotePullOverlay.tsx`

**Interfaces:**
- Consumes: `paletteMap`, `placementGeometry`, `type AccentSlot`, `type Placement` (theming).
- Produces: `QuotePullOverlay` gains optional `palette?: AccentSlot[]`; colors resolve from it (fallback to the retained `ACCENT_COLOR` for the no-palette legacy caller); `Token.color` widened to `string`; local `PLACEMENT`/geometry removed in favor of core `placementGeometry`.

- [ ] **Step 1: Update imports + props**

At the top of `brand-lib/overlays/QuotePullOverlay.tsx`, add:

```tsx
import { paletteMap, placementGeometry, type AccentSlot, type Placement } from '@video-toolkit/lib/theming';
```

Change the `Props` interface: widen `placement` to the core `Placement`, add `palette`:

```tsx
interface Props {
  kind?: 'quote-pull';
  text: string;
  placement: Placement;
  appearAt: number;
  durationMs: number;
  /** Brand palette (layered path passes it); absent for the legacy PhotoSegment
   *  caller, which falls back to ACCENT_COLOR. */
  palette?: AccentSlot[];
}
```

- [ ] **Step 2: Delete the local `PLACEMENT` + `PlacementGeometry`**

Remove the local `type PlacementGeometry`, the `const PLACEMENT: Record<...>` map, and its doc comment (lines ~31–54). The component will use core `placementGeometry(placement)` instead.

- [ ] **Step 3: Widen the `Token` type + resolve colors from palette**

Change the local `Token` interface's `color` fields from `'lime' | 'teal' | null` to `string | null` (both `color` and the `charColors` array element type).

Keep the `const ACCENT_COLOR = { lime: '#c6f432', teal: '#2ad4c5' };` and `const LINEN = '#f5f5f0';` — `ACCENT_COLOR` is now the **fallback** for the no-palette legacy caller.

In the component body, replace the two `ACCENT_COLOR[...]` lookups. First compute a color map from the palette (or fallback):

```tsx
export const QuotePullOverlay: React.FC<Props> = ({ text, placement, appearAt, durationMs, palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = Math.round((appearAt / 1000) * fps);
  const end = start + Math.round((durationMs / 1000) * fps);
  if (frame < start || frame > end) return null;

  const local = frame - start;
  const totalFrames = end - start;
  const colorMap: Record<string, string> = palette ? paletteMap(palette) : ACCENT_COLOR;
  const colorFor = (key: string | null): string => (key ? colorMap[key] ?? LINEN : LINEN);
```

Update the word base color (was `const baseColor = w.color ? ACCENT_COLOR[w.color] : LINEN;`):

```tsx
            const baseColor = colorFor(w.color);
```

Update the per-char color (was `const colorForChar = charColor ? ACCENT_COLOR[charColor] : (charColor === null ? LINEN : baseColor);`):

```tsx
            const colorForChar = w.charColors?.[k] !== undefined ? colorFor(w.charColors[k]) : baseColor;
```

Replace the geometry lookup (was `const geometry = PLACEMENT[placement];`):

```tsx
  const geometry = placementGeometry(placement);
```

Leave `applyBrandEndpoint(text)` unchanged (endpoint rule is deferred). Leave the decoder-scramble, pills, and slide/fade logic untouched.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/xaralis/Workspace/progpce/video-toolkit/projects/pp-namesti-republiky && npx tsc --noEmit 2>&1 | grep -v "Cannot find module '@video-toolkit\|@brand-lib" | grep "QuotePull\|brand-theme" || echo "no new errors"`
Expected: `no new errors`.

- [ ] **Step 5: Commit** (deferred to C3 for end-to-end render).

### Task C3: `LayeredCampaignReel` renders text via the resolver

**Files:**
- Modify: `templates/campaign-reels/src/LayeredCampaignReel.tsx`

**Files (this task):**
- Create: `templates/campaign-reels/src/config/brand-theme.ts`
- Modify: `templates/campaign-reels/src/LayeredCampaignReel.tsx`

**Interfaces:**
- Consumes: `resolveOverlayRenderer`, `overlayConfig`, `DEFAULT_PLACEMENT`, `type Placement`, `type BrandTheme`, `type OverlayRenderProps` (theming); `theme.accentSlots` (C1); `QuotePullOverlay` with its `palette` prop (C2).
- Produces: `brandTheme: BrandTheme` with the `QuotePullAdapter`; campaign text overlays rendered via the resolver.

- [ ] **Step 0: Create the adapter `brand-theme.ts`** (now that `QuotePullOverlay` accepts `palette`)

```tsx
// templates/campaign-reels/src/config/brand-theme.ts
import type { BrandTheme, OverlayRenderProps } from '@video-toolkit/lib/theming';
import { theme } from './theme';
import { QuotePullOverlay } from '@brand-lib/overlays/QuotePullOverlay';

// Shallow integration: QuotePullOverlay keeps its own props (appearAt, etc.) for
// its legacy PhotoSegment caller. This adapter maps the shared OverlayRenderProps
// onto them and threads the palette through.
const QuotePullAdapter: React.FC<OverlayRenderProps> = (p) => (
  <QuotePullOverlay
    text={p.text}
    placement={p.placement}
    appearAt={p.appearAtMs}
    durationMs={p.durationMs}
    palette={p.palette}
  />
);

export const brandTheme: BrandTheme = {
  accentSlots: theme.accentSlots,
  overlays: { text: { renderer: QuotePullAdapter } },
};
```

- [ ] **Step 1: Swap the `QuotePullOverlay` call in `renderOverlayItem`**

Remove `import { QuotePullOverlay } from '@brand-lib/overlays/QuotePullOverlay';` from `LayeredCampaignReel.tsx` (it is now reached via the brand theme) and add:

```tsx
import { resolveOverlayRenderer, overlayConfig, DEFAULT_PLACEMENT, type Placement } from '@video-toolkit/lib/theming';
import { brandTheme } from './config/brand-theme';
```

Replace the `case 'text': case 'quote-pull':` block:

```tsx
    case 'text':
    case 'quote-pull': {
      const TextRenderer = resolveOverlayRenderer(brandTheme, 'text');
      return (
        <TextRenderer
          text={content.text as string}
          placement={(item.position as Placement) ?? DEFAULT_PLACEMENT}
          fontSize={content.fontSize as number | undefined}
          reveal={content.reveal as 'line' | 'all' | undefined}
          palette={brandTheme.accentSlots}
          config={overlayConfig(brandTheme, 'text')}
          appearAtMs={0}
          durationMs={durationMs}
        />
      );
    }
```

- [ ] **Step 2: Sync template → projects**

The campaign projects carry copies of `LayeredCampaignReel.tsx` + `config/theme.ts` and need the new `config/brand-theme.ts`. Sync into every project that has a layered composition (the same set migrated previously). For each `projects/<p>`:

```bash
cd /Users/xaralis/Workspace/progpce/video-toolkit
for p in projects/pp-*; do
  [ -f "$p/src/LayeredCampaignReel.tsx" ] || continue
  cp templates/campaign-reels/src/LayeredCampaignReel.tsx "$p/src/LayeredCampaignReel.tsx"
  cp templates/campaign-reels/src/config/theme.ts         "$p/src/config/theme.ts"
  cp templates/campaign-reels/src/config/brand-theme.ts   "$p/src/config/brand-theme.ts"
done
```

(The `@brand-lib` alias resolves `QuotePullOverlay` for every project, so no per-project QuotePull copy needs changing for the layered path.)

- [ ] **Step 3: Render-verify campaign quote-pull is unchanged**

Pick a project with a quote-pull overlay (e.g. `pp-namesti-republiky`). Find a text/quote-pull overlay's on-screen window in its `src/Root.tsx` (`tracks.overlays` entry with `content.kind` `'text'` or `'quote-pull'`), then render a frame ~0.5s into that window — `frame = round((startMs/1000)*30) + 15`:

```bash
cd /Users/xaralis/Workspace/progpce/video-toolkit/projects/pp-namesti-republiky
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
# read the quote-pull's startMs/endMs from src/Root.tsx and compute the frame:
FRAME=$(python3 - <<'PY'
import re, pathlib
src = pathlib.Path('src/Root.tsx').read_text()
# find the first overlay whose content kind is text/quote-pull and read its startMs
m = re.search(r"startMs:\s*(\d+)[^}]*?kind:\s*'(?:text|quote-pull)'", src, re.S) \
    or re.search(r"kind:\s*'(?:text|quote-pull)'[^}]*?startMs:\s*(\d+)", src, re.S)
start = int(m.group(1)) if m else 0
print(round(start/1000*30) + 15)
PY
)
echo "rendering frame $FRAME"
OUT=/private/tmp/claude-502/-Users-xaralis-Workspace-progpce-core/924bb9dc-fb08-4788-b4c2-b893233465ac/scratchpad/pp-quote.png
npx remotion still LayeredCampaignReel "$OUT" --frame="$FRAME"
```

Expected: the quote-pull renders identically to before — lime/teal accented words, coal pills, decoder reveal intact (palette now sourced from the brand theme rather than the inline const). If the project has no text/quote-pull overlay, pick another `pp-*` project that does.

- [ ] **Step 4: Commit (campaign)**

```bash
cd /Users/xaralis/Workspace/progpce/video-toolkit
git add templates/campaign-reels/src/config/theme.ts \
        templates/campaign-reels/src/config/brand-theme.ts \
        templates/campaign-reels/src/LayeredCampaignReel.tsx \
        brand-lib/overlays/QuotePullOverlay.tsx \
        projects/pp-*/src/LayeredCampaignReel.tsx \
        projects/pp-*/src/config/theme.ts \
        projects/pp-*/src/config/brand-theme.ts
timeout 15 git commit -m "feat(campaign): text overlay via theming module — brand palette adapter" \
  || git -c commit.gpgsign=false commit -m "feat(campaign): text overlay via theming module — brand palette adapter"
```

### Task C4: Campaign editor host passes `accentSlots`

**Files:**
- Modify: `templates/campaign-reels/.editor/main.tsx`

- [ ] **Step 1: Import brand theme + pass slots**

In `templates/campaign-reels/.editor/main.tsx`, add:

```tsx
import { brandTheme } from '../src/config/brand-theme';
```

and add `accentSlots={brandTheme.accentSlots}` to the `<LayeredInspector ... />` element (mirroring B4).

- [ ] **Step 2: Verify in the editor**

Start the campaign editor host, select a quote-pull overlay; the accent toolbar shows **Lime / Teal** (with swatches) — same palette as before, now brand-sourced. Stop the server after confirming.

- [ ] **Step 3: Commit (campaign)**

```bash
cd /Users/xaralis/Workspace/progpce/video-toolkit
timeout 15 git commit -am "feat(campaign): editor host passes brand accentSlots to inspector" \
  || git -c commit.gpgsign=false commit -am "feat(campaign): editor host passes brand accentSlots to inspector"
```

---

## Final verification (whole-branch)

- [ ] Core suite green: `cd /Users/xaralis/Workspace/progpce/core/lib/editor && npm test` — all pass.
- [ ] Roost render (Task B3) shows the accented teaser word in the roost slot color; roost editor (B4) shows Gold/Rust/Green.
- [ ] Campaign render (C3) shows the quote-pull unchanged; campaign editor (C4) shows Lime/Teal.
- [ ] `git status` in both brand repos shows only the `toolkit` submodule pointer unstaged.
- [ ] Re-bump the core submodule pin in each brand repo to the final core SHA when the branch is ready (out of band, per existing convention).
