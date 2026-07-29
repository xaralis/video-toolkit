// `fade-to-color` AT A REEL EDGE, and the silence that hid a broken migration.
//
// Two claims live here, and they are deliberately different in kind.
//
// (1) A CHARACTERIZATION PIN. An authored colour IS honoured at the reel's
//     trailing edge — the node's own `color` paints, and the edge plate
//     (Task 2.2, `theme.background`) only ever fills the MISSING INPUT behind
//     it. This was suspected broken and is not: it is pinned here so the
//     suspicion cannot return, and so the edge plate can never be "simplified"
//     into stealing the parameter.
//
// (2) A REGRESSION TEST FOR THE REAL DEFECT. `fade-to-color`'s colour is a
//     brand accent-slot KEY, resolved against the palette in
//     `lib/render/at-cut-transitions.tsx`. When that key does not resolve —
//     because the brand never declared the slot, or because the CALLER never
//     threaded `palette` into `buildVideoNodes` at all — the kind degrades to
//     the plain crossfade and says NOTHING. That silence is what let a brand
//     migration ship believing it had a dip: every observable (the rendered
//     frames, deleting the slot, forcing the slot to magenta) is identical,
//     because the palette never arrived and the colour was never read.
//
//     Every other silent degrade on this path already warns — an unrecognised
//     kind, a two-input node fetched through `presentationFor`, overlapping
//     boundaries. This one did not, and it is the one that cost a migration.
//
// jsdom, so this says nothing about pixels; `examples/layered-minimal`'s pixel
// harness covers those. `Sequence` is a passthrough (the stub
// `reel-edge-background.test.tsx` uses) because where the boundary window SITS
// is settled by video-track-layout.test.ts — what matters here is what the
// boundary hands the node, and what the node paints.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    // Frame 10 of a 20-frame boundary — progress 0.5, the midpoint, which is
    // exactly where `fade-to-color`'s colour is at FULL opacity and nothing of
    // either input shows through. If the colour paints anywhere, it paints here.
    useCurrentFrame: () => 10,
    useVideoConfig: () => ({
      width: 1080, height: 1920, fps: 30, durationInFrames: 300, id: 'test', defaultProps: {}, props: {},
    }),
    staticFile: (s: string) => s,
    Sequence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Audio: () => null,
  };
});

import { buildVideoNodes } from '@video-toolkit/lib/render/video-track';
import { resetWarnOnce } from '@video-toolkit/lib/render/warn-once';
import type { AccentSlot } from '@video-toolkit/lib/theming/palette';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

/** A colour nothing else in this file uses, so "the clip" can never be mistaken
 *  for the dip or for the edge plate. */
const CLIP = 'rgb(0, 255, 0)';

/** ONE item, so its `transitionOut` is the reel's TRAILING EDGE: a boundary
 *  with `to === null`. This is the shape of the site that failed — the last
 *  segment of a reel carrying a `transitionOut`. */
const reelEndingWith = (color: string | undefined): VideoItem[] =>
  [{
    id: 'only',
    kind: 'card',
    startMs: 0,
    endMs: 2000,
    cardKind: 'plate',
    transitionOut: { kind: 'fade-to-color', frames: 20, ...(color === undefined ? {} : { color }) },
  }] as unknown as VideoItem[];

const build = (
  items: VideoItem[],
  opts: { palette?: readonly AccentSlot[]; background?: string } = {},
) =>
  render(
    <>
      {buildVideoNodes(items, {
        width: 1080,
        height: 1920,
        fps: 30,
        renderItem: () => <div style={{ backgroundColor: '#00ff00' }} />,
        ...opts,
      })}
    </>,
  ).container;

/** Every full-frame colour the boundary painted, in paint order. */
const paintedColors = (c: HTMLElement) =>
  [...c.querySelectorAll('div')].map((d) => d.style.backgroundColor).filter((bg) => bg !== '');

const slots = (hex: string): AccentSlot[] => [{ key: 'dip', label: 'Dip', color: hex }];

let warnings: string[] = [];
let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetWarnOnce();
  warnings = [];
  spy = vi.spyOn(console, 'warn').mockImplementation((m: unknown) => { warnings.push(String(m)); });
});
afterEach(() => spy.mockRestore());

// ---------------------------------------------------------------------------
// (1) The capability: an authored colour is honoured AT A REEL EDGE.
// ---------------------------------------------------------------------------
describe('fade-to-color at the reel’s trailing edge', () => {
  it('paints the AUTHORED colour, not the edge plate’s background', () => {
    const painted = paintedColors(build(reelEndingWith('dip'), {
      palette: slots('#0a0a0a'),
      background: '#123456',
    }));
    expect({
      dip: painted.filter((c) => c === 'rgb(10, 10, 10)').length,
      plate: painted.filter((c) => c === 'rgb(18, 52, 86)').length,
    }).toEqual({
      // The dip is painted…
      dip: 1,
      // …and the edge plate still fills the missing `to` input BEHIND it. The
      // plate is not the bug and is not being removed; it just isn't the dip.
      plate: 1,
    });
  });

  // THE ANTI-CONFLATION PIN. If the edge path ever resolved the dip through
  // `theme.background` instead of the node's own parameter, the test above
  // would still pass whenever the two happened to match. Make them differ and
  // move ONLY the slot: the dip must follow the slot, and the plate must not.
  it('follows the SLOT when the slot changes, with the background held fixed', () => {
    const painted = paintedColors(build(reelEndingWith('dip'), {
      palette: slots('#ff00ff'),
      background: '#123456',
    }));
    expect({
      followed: painted.filter((c) => c === 'rgb(255, 0, 255)').length,
      staleDip: painted.filter((c) => c === 'rgb(10, 10, 10)').length,
      plate: painted.filter((c) => c === 'rgb(18, 52, 86)').length,
    }).toEqual({ followed: 1, staleDip: 0, plate: 1 });
  });

  it('still shows the outgoing clip as the input the dip covers', () => {
    expect(paintedColors(build(reelEndingWith('dip'), { palette: slots('#0a0a0a'), background: '#123456' })))
      .toContain(CLIP);
  });
});

// ---------------------------------------------------------------------------
// (2) The defect: an authored colour that does not resolve must SAY SO.
// ---------------------------------------------------------------------------
describe('an authored fade-to-color colour that does not resolve', () => {
  // THE EXACT FAILURE THAT SHIPPED. The literal named a slot; the caller never
  // threaded `palette` into `buildVideoNodes`; the key resolved to nothing and
  // the boundary crossfaded. Nothing said why, so the three obvious
  // experiments — render it, delete the slot, force the slot to magenta — all
  // produced identical frames and the migration read that as "inert colour"
  // rather than "the palette never arrived".
  it('warns when the caller threaded no palette at all', () => {
    build(reelEndingWith('dip'), { background: '#123456' });
    expect(warnings.join('\n')).toMatch(/fade-to-color/);
    expect(warnings.join('\n')).toMatch(/"dip"/);
  });

  it('warns when the palette is present but does not declare the slot', () => {
    build(reelEndingWith('dip'), { palette: slots('#0a0a0a'), background: '#123456' });
    // The slot declared is `dip`, so this one DOES resolve — no warning.
    expect(warnings).toEqual([]);

    resetWarnOnce();
    warnings = [];
    build(reelEndingWith('nosuchslot'), { palette: slots('#0a0a0a'), background: '#123456' });
    expect(warnings.join('\n')).toMatch(/nosuchslot/);
  });

  // The message has to be ACTIONABLE, because the two causes need different
  // fixes and the author cannot tell them apart from the frames: declare the
  // slot on the brand theme, or thread `palette` through at the call site.
  it('names both causes and the degraded result', () => {
    build(reelEndingWith('dip'), { background: '#123456' });
    const text = warnings.join('\n');
    expect(text).toMatch(/accent/i);
    expect(text).toMatch(/palette/i);
    expect(text).toMatch(/crossfade|plain fade/i);
  });

  // NO COLOUR AUTHORED IS NOT A DEFECT. `{kind:'fade-to-color'}` with no
  // `color` is the documented "no colour means no dip" case and resolves to the
  // plain fade by design — warning there would be crying wolf on every reel
  // that legitimately uses it.
  it('stays silent when no colour was authored at all', () => {
    build(reelEndingWith(undefined), { palette: slots('#0a0a0a'), background: '#123456' });
    expect(warnings).toEqual([]);
  });

  // Render-path code: `resolveTransition` runs on every frame of the boundary,
  // so the message must not repeat 600 times for a 20-second reel.
  it('warns once per key, not once per frame', () => {
    build(reelEndingWith('dip'), { background: '#123456' });
    build(reelEndingWith('dip'), { background: '#123456' });
    build(reelEndingWith('dip'), { background: '#123456' });
    expect(warnings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// (3) THE WIDENING: `color` accepts a literal hex too, not just an accent key.
//
// This is the fix for the PP migration itself (see
// .superpowers/sdd/2026-07-26-phase4-node-contract/fade-to-color-edge-fix-report.md):
// PP's `coal` is a BACKGROUND colour in its own model, not an accent, and its
// vendored renderer never threads `palette` into `buildVideoNodes` at all —
// so an accent-slot key can NEVER resolve at that call site regardless of what
// the brand theme declares. A literal sidesteps both problems: it needs no
// palette to resolve, because it already IS the colour.
// ---------------------------------------------------------------------------
describe('fade-to-color with a LITERAL colour (no palette needed)', () => {
  it('THE CAPABILITY: a literal paints, with NO palette threaded at all', () => {
    const painted = paintedColors(build(reelEndingWith('#0a0a0a'), { background: '#123456' }));
    expect(painted.filter((c) => c === 'rgb(10, 10, 10)')).toHaveLength(1);
  });

  it('a literal paints even when a palette IS present, unaffected by its slots', () => {
    const painted = paintedColors(build(reelEndingWith('#0a0a0a'), {
      palette: slots('#ff00ff'),
      background: '#123456',
    }));
    // The dip is the literal, not the (unrelated) palette slot.
    expect(painted.filter((c) => c === 'rgb(10, 10, 10)')).toHaveLength(1);
    expect(painted.filter((c) => c === 'rgb(255, 0, 255)')).toHaveLength(0);
  });

  it('does NOT warn for a literal colour, with or without a palette', () => {
    build(reelEndingWith('#0a0a0a'), { background: '#123456' });
    build(reelEndingWith('#0a0a0a'), { palette: slots('#ff00ff'), background: '#123456' });
    expect(warnings).toEqual([]);
  });

  // An accent key still resolves through the palette, unaffected by the
  // widening — the PARITY half, kept alongside the capability so the two
  // cannot be confused for the same pin.
  it('an accent key still resolves through the palette, exactly as before', () => {
    const painted = paintedColors(build(reelEndingWith('dip'), {
      palette: slots('#0a0a0a'),
      background: '#123456',
    }));
    expect(painted.filter((c) => c === 'rgb(10, 10, 10)')).toHaveLength(1);
  });

  // An unresolvable ACCENT KEY (not shaped like a literal) must still warn —
  // the widening must not quiet the real defect this file exists to catch.
  it('an unresolvable accent key still warns, unaffected by the widening', () => {
    build(reelEndingWith('no-such-slot'), { palette: slots('#0a0a0a'), background: '#123456' });
    expect(warnings.join('\n')).toMatch(/no-such-slot/);
  });
});
