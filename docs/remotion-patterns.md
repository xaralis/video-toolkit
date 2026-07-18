# Remotion Patterns — Toolkit Conventions

Common Remotion patterns used across this toolkit. For full framework
knowledge see the `remotion-official` skill; this file documents the
conventions specific to *our* templates.

## Animations

```tsx
const frame = useCurrentFrame();
const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
```

## Sequencing

```tsx
<Series>
  <Series.Sequence durationInFrames={150}><TitleSlide /></Series.Sequence>
  <Series.Sequence durationInFrames={900}><DemoClip /></Series.Sequence>
</Series>
```

## Media

**Always use `<OffthreadVideo>`, never `<video>`** — Remotion requires
its own video component for frame-accurate rendering. Using a raw
`<video>` tag will not render correctly.

```tsx
<OffthreadVideo src={staticFile('demo.mp4')} />
<Audio src={staticFile('voiceover.mp3')} volume={1} />
<Audio src={staticFile('music.mp3')} volume={0.15} />
```

## Scene Transitions

The toolkit includes a transitions library at `lib/transitions/`. See
the registry `transitions` section for the full list with options and
best-use descriptions. Full documentation lives in
`lib/transitions/README.md`.

### Using TransitionSeries

```tsx
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { glitch, lightLeak, zoomBlur } from '@video-toolkit/lib/transitions';

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={90}>
    <TitleSlide />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    presentation={glitch({ intensity: 0.8 })}
    timing={linearTiming({ durationInFrames: 20 })}
  />
  <TransitionSeries.Sequence durationInFrames={120}>
    <ContentSlide />
  </TransitionSeries.Sequence>
</TransitionSeries>
```

### Transition Options Examples

```tsx
glitch({ intensity: 0.8, slices: 8, rgbShift: true })      // Tech/cyberpunk
lightLeak({ temperature: 'warm', direction: 'right' })       // Warm celebration
zoomBlur({ direction: 'in', blurAmount: 20 })                // High energy
rgbSplit({ direction: 'diagonal', displacement: 30 })        // Chromatic aberration
```

### Timing Functions

```tsx
linearTiming({ durationInFrames: 30 })                                      // Constant speed
springTiming({ config: { damping: 200 }, durationInFrames: 45 })            // Physics bounce
```

### Transition Duration Guidelines

| Type | Frames | Notes |
|------|--------|-------|
| Quick cut | 10-15 | Fast, punchy |
| Standard | 20-30 | Most common |
| Dramatic | 40-60 | Slow reveals |
| Glitch effects | 15-25 | Should feel sudden |
| Light leak | 30-45 | Needs time to sweep |

Preview all transitions: `cd showcase/transitions && npm run studio`
