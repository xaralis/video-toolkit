# Transitions Library

Scene transition effects for Remotion videos. Combines official `@remotion/transitions` with custom presentations for a comprehensive transition toolkit.

## Installation

The transitions package is installed in each template. If setting up manually:

```bash
npm install @remotion/transitions @remotion/paths @remotion/shapes
```

## Usage

Transitions work with Remotion's `TransitionSeries` component:

```tsx
import { TransitionSeries, linearTiming, springTiming } from '@remotion/transitions';
import { glitch, rgbSplit, lightLeak } from '@video-toolkit/lib/transitions';

export const MyVideo = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={90}>
        <TitleScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={glitch({ intensity: 0.8 })}
        timing={linearTiming({ durationInFrames: 20 })}
      />

      <TransitionSeries.Sequence durationInFrames={120}>
        <ContentScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={lightLeak({ temperature: 'warm' })}
        timing={springTiming({ config: { damping: 200 } })}
      />

      <TransitionSeries.Sequence durationInFrames={90}>
        <EndScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
```

## Available Transitions

### Custom Transitions (this library)

The `Kind` column is the name a **config** uses — `{ kind: 'rgb-split', frames: 12 }` on a
video item's `transitionIn`/`transitionOut`, which the editor's Kind dropdown offers and the
shared at-cut engine renders (`lib/render/at-cut-transitions.tsx`). The `Transition` column is
the presentation function, for driving `<TransitionSeries>` by hand. Same effect, two entry
points; the catalog that connects them is `lib/reel-config-base/transition-schema.ts`.

The `Seen` column records where a presentation has actually been *looked at*, which is not
the same as being wired up. `Series` means it renders correctly when hand-driven through
`<TransitionSeries>` — that is what `showcase/transitions/` exercises, and what this table's
old "✅ Validated" column meant, back when hand-driving was the only integration path. **No
kind is yet visually confirmed through the at-cut engine**, which composites differently
(handle-borrowed overlap rather than a shrinking sequence), so a presentation that looks right
in the gallery can still misbehave at a cut. **Core can render** —
`examples/layered-minimal` is a complete, installed Remotion project (`npx remotion still
src/index.ts MinimalReel out/probe.png --frame=45` bundles and renders a real PNG there, exit
0; `out/` is gitignored). Closing this gap is therefore a concrete core task, not something
that needs a brand repo: author a reel literal in `examples/layered-minimal` that exercises
each of the 11 unconfirmed kinds at a cut and render stills. See the risk entry in
`docs/superpowers/HANDOFF.md` for the full picture, including two defects a still render would
directly confirm or refute.

| Transition | Kind | Seen | Description | Best For |
|------------|------|------|-------------|----------|
| `glitch()` | `glitch` | Series | Digital distortion with slice displacement and RGB separation | Tech demos, cyberpunk, edgy reveals |
| `rgbSplit()` | `rgb-split` | Series | Chromatic aberration with color fringing | Modern tech, energetic transitions |
| `zoomBlur()` | `zoom-blur` | Series | Radial motion blur with scale | CTAs, reveals, high-energy moments |
| `lightLeak()` | `light-leak` | Series | Cinematic lens flare and overexposure | Emotional moments, celebrations, film aesthetic |
| `pixelate()` | `pixelate` | **Two-input node** | Digital mosaic dissolution | Retro/gaming, digital transformations |
| `checkerboard()` | `checkerboard` | **Two-input node** | Grid-based reveal with multiple patterns | Playful reveals, structured transitions |
| `scanlineGlitch()` | `scanline-glitch` | **Two-input node** | Compressed CRT scanlines + RGB shift | Retro-futurism, modern edgy reels |
| `whipPan()` | `whip-pan` | — | Directional motion blur — fast camera move | Energetic cuts, fast-paced reels |
| `zoomThrough()` | `zoom-through` | — | Zoom out of outgoing, zoom into incoming | Product reveals, fast-cut edits |
| `wipe()` | `wipe` | **Two-input node** | Directional sweep in a brand colour | Brand-consistent directional reveals |
| `gradientWipe()` | `gradient-wipe` | — | Feathered diagonal blend band | Soft corner-to-corner reveals |
| `burn()` | `burn` | At-cut | Cloud-masked burn-through with a hot edge | Organic reveals, warm brand moments |
| `fadeToColor()` | `fade-to-color` | **Two-input node** (with a colour) | Dip to a colour the BRAND names; with no colour, the plain crossfade | Section breaks, a beat of brand colour between clips |

**Four kinds are ALWAYS NATIVE TWO-INPUT NODES** (`wipe`, `checkerboard`, `pixelate`,
`scanline-glitch`), marked above; `fade-to-color` is one only when a colour actually
resolves — with none it hands back Remotion's own `fade()`, which is what keeps every baked
`fade-coal` literal byte-identical (Task 2.3). Their factories return a `TransitionNode` —
`{ composite }`, one component invoked ONCE per boundary with `(from, to, progress)` —
not a `TransitionPresentation`. They cannot be used with `TransitionSeries`, which hands a
presentation one clip at a time; drive them through `transitionNodeFor()` +
`AtCutTransition` (or `buildVideoNodes`), which is what a layered reel already does.
`presentationFor()` returns `null` for them and warns. Every other kind is still one-sided
and core lifts it. See `docs/superpowers/phase4-migrations.md` § Task 2.1.

**One name per concept** (Task 2.5). Every kind spells the in/out or 4-way axis `direction` —
`zoom-through` used to call it `from`, and that field survives only as a deprecated alias so
baked literals keep rendering (it warns once and has no editor control). The gallery
(`TransitionGallery.tsx`) resolves each kind it demonstrates through the **reel's own**
`transitionNodeFor`, so it cannot drift into showing a different component under a catalog
kind's name again.

A kind's tunable params are exactly its schema fields minus `kind`/`frames` (and any
deprecated alias); the editor derives its sub-option controls from that shape, so the two
can't disagree. Every param of the six
kinds wired in most recently (`rgb-split`, `scanline-glitch`, `light-leak`, `zoom-blur`,
`pixelate`, `checkerboard`) is optional — `{ kind, frames }` alone renders the presentation's
own defaults.

### Official Transitions (re-exported)

| Transition | Description |
|------------|-------------|
| `slide()` | Scene slides in from a direction |
| `fade()` | Simple crossfade |
| `flip()` | 3D card flip |

`@remotion/transitions/wipe` is deliberately **not** listed and is no longer used anywhere in
core (Phase 4 Task 2.5). The toolkit's `wipe` kind is the two-input node in the table above;
having the official one under the same name meant the gallery demonstrated a different
component than reels rendered. One name, one component.

## Transition Options

### glitch(options?)

```tsx
glitch({
  intensity: 0.8,      // Effect strength (0-1). Default: 0.8
  slices: 8,           // Horizontal slice count. Default: 8
  rgbShift: true,      // RGB channel separation. Default: true
  scanLines: true,     // CRT scan line overlay. Default: true
})
```

### rgbSplit(options?)

```tsx
rgbSplit({
  direction: 'horizontal',  // 'horizontal' | 'vertical' | 'diagonal'. Default: 'horizontal'
  displacement: 30,         // Max pixel offset. Default: 30
  channelBlur: true,        // Motion blur on channels. Default: true
})
```

### zoomBlur(options?)

```tsx
zoomBlur({
  direction: 'in',     // 'in' (toward viewer) | 'out' (away). Default: 'in'
  blurAmount: 20,      // Max blur pixels. Default: 20
  scaleAmount: 1.15,   // Scale multiplier. Default: 1.15
  origin: 'center',    // 'center' | 'top' | 'bottom' | 'left' | 'right'. Default: 'center'
})
```

### lightLeak(options?)

```tsx
lightLeak({
  temperature: 'warm',    // 'warm' | 'cool' | 'rainbow'. Default: 'warm'
  direction: 'right',     // 'left' | 'right' | 'top' | 'bottom' | 'center'. Default: 'right'
  intensity: 0.8,         // Overexposure strength (0-1). Default: 0.8
  flareArtifacts: true,   // Lens flare spots. Default: true
})
```

### pixelate(options?)

```tsx
pixelate({
  maxBlockSize: 60,       // Max pixel block size. Default: 60
  gridSize: 12,           // Grid dimensions. Default: 12
  scanlines: true,        // CRT scanline overlay. Default: true
  glitchArtifacts: true,  // RGB split and glitch slices. Default: true
  randomness: 0.8,        // Block reveal randomness (0-1). Default: 0.8
})
```

### checkerboard(options?)

```tsx
checkerboard({
  gridSize: 8,                // Grid dimensions (8 = 8x8). Default: 8
  pattern: 'diagonal',        // Reveal pattern. Default: 'diagonal'
  stagger: 0.15,              // Delay between squares (0-1). Default: 0.15
  squareAnimation: 'fade',    // 'fade' | 'scale' | 'flip'. Default: 'fade'
})
```

**Available patterns:**
- `sequential` - Left-to-right, top-to-bottom
- `random` - Random order
- `diagonal` - Diagonal wave from top-left
- `alternating` - True checkerboard pattern
- `spiral` - Spiral from center outward
- `rows` - Row by row
- `columns` - Column by column
- `center-out` - Radial from center
- `corners-in` - From corners toward center

## Timing Functions

### linearTiming

Constant speed transition:

```tsx
linearTiming({ durationInFrames: 30 })  // 1 second at 30fps
```

### springTiming

Physics-based with bounce:

```tsx
springTiming({
  config: {
    damping: 200,      // Higher = less bounce
    stiffness: 100,    // Higher = snappier
    mass: 1,           // Higher = slower
  },
  durationInFrames: 45,  // Optional max duration
})
```

## Choosing Transitions

| Video Type | Recommended Transitions |
|------------|------------------------|
| **Tech/Product Demo** | `glitch`, `rgbSplit`, `slide` |
| **Corporate/Professional** | `fade`, `wipe`, `zoomBlur` |
| **Celebration/Launch** | `lightLeak`, `zoomBlur` |
| **Retro/Gaming** | `pixelate`, `glitch` |
| **Cinematic** | `lightLeak`, `fade`, `wipe` |
| **Playful/Creative** | `checkerboard`, `flip` |
| **High Energy** | `zoomBlur`, `rgbSplit`, `glitch` |
| **Structured/Grid** | `checkerboard`, `pixelate` |

## Transition Duration Guidelines

| Transition Type | Recommended Duration | Notes |
|-----------------|---------------------|-------|
| Quick cut | 10-15 frames | Fast, punchy |
| Standard | 20-30 frames | Most common |
| Dramatic | 40-60 frames | Slow reveals |
| Glitch effects | 15-25 frames | Should feel sudden |
| Light leak | 30-45 frames | Needs time to sweep |

## Combining with Audio

Add sound effects to transitions:

```tsx
import { Audio, Sequence } from 'remotion';

// Play whoosh sound during transition
<Sequence from={transitionStartFrame} durationInFrames={30}>
  <Audio src={staticFile('sfx/whoosh.mp3')} volume={0.5} />
</Sequence>
```

## Transition Gallery

### Standalone Showcase

Preview all transitions with the dedicated showcase project:

```bash
cd showcase/transitions
npm install
npm run studio
```

Opens Remotion Studio with a visual gallery showing each transition as Scene A → Scene B with labels and descriptions.

### Embedding in Projects

Add the gallery to your own project's Root.tsx:

```tsx
import { TransitionGallery, transitionGalleryConfig } from '@video-toolkit/lib/transitions/TransitionGallery';

// Register in Root.tsx
<Composition
  id={transitionGalleryConfig.id}
  component={TransitionGallery}
  durationInFrames={transitionGalleryConfig.durationInFrames}
  fps={transitionGalleryConfig.fps}
  width={transitionGalleryConfig.width}
  height={transitionGalleryConfig.height}
/>
```

Then run `npm run studio` and select "TransitionGallery" to preview all transitions.

The gallery lives in `lib/` and imports `@remotion/transitions` at runtime, so the consuming
project's `remotion.config.ts` must set `resolve.modules` to include its own `node_modules`
(see `showcase/transitions/remotion.config.ts`) — webpack's upward walk from a `lib/` file
never reaches it otherwise.

### Single Transition Preview

For interactive previews (e.g., with `@remotion/player`):

```tsx
import { SingleTransitionPreview, transitionMap } from '@video-toolkit/lib/transitions/TransitionGallery';

// Preview a specific transition
<SingleTransitionPreview transitionName="glitch" />

// Access transition config programmatically
const { duration, render } = transitionMap.lightLeak;
const demo = render('lightLeak', duration); // React.ReactElement, e.g. for a custom preview
```

## Technical Notes

1. **TransitionSeries vs Series**: `TransitionSeries` allows overlapping scenes during transitions. Regular `Series` does not.

2. **Duration calculation**: Total video duration = sum of sequence durations - sum of transition durations (because scenes overlap).

3. **Performance**: Complex transitions (glitch, pixelate) use SVG filters which may impact preview performance. Final renders are unaffected.

4. **Browser compatibility**: All transitions use standard CSS/SVG features. Tested in Chrome (Remotion's render target).
