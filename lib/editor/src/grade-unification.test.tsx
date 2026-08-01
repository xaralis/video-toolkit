import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Phase 4 Task 3.4 — `item.grade` and a `type: 'grade'` effect are now ONE
// implementation (lib/theming/effects/style-effect.ts's `gradeStyleEffect`),
// reached two ways: `item.grade` is synthesized as the FIRST style-axis
// effect (`applyStyleEffects`), and an authored `type: 'grade'` entry
// resolves through the SAME renderer.
//
// segment-media-merge-baseline.test.tsx (Task 3.1) already pins the
// crop x ken-burns x grade merge byte-for-byte and stays green and
// UNMODIFIED by this task — that is the "verbatim" proof. This file covers
// what is NEW: the synthetic-injection mechanism itself, its ordering
// relative to OTHER style effects (not exercised by the baseline, since
// ken-burns never produces a `filter`), and that a `type: 'grade'` effect
// entry now renders through the style axis rather than the old WRAPPER-axis
// `GradeEffect` div (effects-registry.test.tsx pins that side).
// ---------------------------------------------------------------------------

const frameState = vi.hoisted(() => ({ frame: 0 }));
const captured = vi.hoisted(() => ({ img: [] as any[] }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => frameState.frame,
    useVideoConfig: () => ({ fps: 30 }),
    staticFile: (s: string) => s,
    Img: (props: any) => {
      captured.img.push(props);
      return null;
    },
    OffthreadVideo: () => null,
  };
});

import { SegmentMedia } from '@video-toolkit/lib/theming/segment/SegmentMedia';
import { applyStyleEffects, type StyleEffectRegistry } from '@video-toolkit/lib/theming/effects/style-effect';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

beforeEach(() => {
  frameState.frame = 0;
  captured.img.length = 0;
});

const baseItem = (patch: Partial<VideoItem> = {}): VideoItem =>
  ({
    id: 'm1',
    kind: 'photo',
    startMs: 0,
    endMs: 3000,
    source: 'photos/a.jpg',
    ...patch,
  }) as VideoItem;

describe('item.grade delivers through SegmentMedia (the real render path)', () => {
  // MUTATION TARGET 1 (task brief): break the synthetic-effect path — e.g.
  // stop injecting `item.grade` in `applyStyleEffects`'s
  // `syntheticGradeEffect` call (lib/theming/effects/style-effect.ts). This
  // test goes red the moment that injection is removed: `item.grade` alone
  // (no authored effect at all) must still reach the media element's
  // `filter`.
  it('an item.grade with NO effects[] at all still reaches the rendered filter', () => {
    render(
      <SegmentMedia
        item={baseItem({ grade: { brightness: 1.2, contrast: 0.9 } } as Partial<VideoItem>)}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );
    expect(captured.img).toHaveLength(1);
    expect(captured.img[0].style.filter).toBe('brightness(1.2) contrast(0.9)');
  });

  it('an item with no grade at all gets no filter (no false positive)', () => {
    render(<SegmentMedia item={baseItem()} handles={{ inHalf: 0, outHalf: 0 }} />);
    expect(captured.img[0].style.filter).toBeUndefined();
  });
});

describe('a `type: "grade"` effect entry renders through the SAME style-axis path', () => {
  it('applies identically to item.grade when authored as an effect instead', () => {
    render(
      <SegmentMedia
        item={baseItem({ effects: [{ type: 'grade', brightness: 1.2, contrast: 0.9 }] } as Partial<VideoItem>)}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );
    expect(captured.img[0].style.filter).toBe('brightness(1.2) contrast(0.9)');
  });

  // Dedup: item.grade wins when an item somehow carries both (a hand-edited
  // literal — the schema does not reject it; the editor's own guards prevent
  // AUTHORING both through the UI, not a malformed config from having both).
  // `applyStyleEffects` marks `grade` as `applied` from the synthetic entry
  // BEFORE the array is walked, so the effect-array entry is skipped, never
  // doubled.
  it('item.grade wins over a redundant authored grade effect — no doubling', () => {
    render(
      <SegmentMedia
        item={
          baseItem({
            grade: { brightness: 1.2 },
            effects: [{ type: 'grade', brightness: 3, contrast: 5 }],
          } as Partial<VideoItem>)
        }
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );
    // NOT brightness(1.2) brightness(3) contrast(5), and not brightness(3)
    // contrast(5) either — item.grade's OWN fragment is the only one applied.
    expect(captured.img[0].style.filter).toBe('brightness(1.2)');
  });
});

describe('applyStyleEffects: grade is evaluated FIRST (Phase 4 Task 3.4)', () => {
  // MUTATION TARGET 2 (task brief): break the "evaluated first" ordering —
  // e.g. append the synthetic grade entry AFTER `item.effects` instead of
  // before. Ken-burns alone cannot catch this (it never sets `filter`), so
  // this test registers a SECOND style effect that does, through the real
  // `styleEffects` prop SegmentMedia already threads (Phase 4 Task 3.2/3.3
  // plumbing) — the real delivery path, not a bare call to
  // `applyStyleEffects` in isolation.
  const registryWithLaterFilter: StyleEffectRegistry = {
    'brand-tint': { renderer: () => ({ filter: 'sepia(0.5)' }) },
  };

  it('composes grade filter FIRST, a later style effect´s filter AFTER it — through SegmentMedia', () => {
    render(
      <SegmentMedia
        item={
          baseItem({
            grade: { brightness: 1.2 },
            effects: [{ type: 'brand-tint' }],
          } as Partial<VideoItem>)
        }
        handles={{ inHalf: 0, outHalf: 0 }}
        styleEffects={registryWithLaterFilter}
      />,
    );
    expect(captured.img[0].style.filter).toBe('brightness(1.2) sepia(0.5)');
  });

  // Same fact, pinned directly against `applyStyleEffects` too (belt and
  // suspenders — the SegmentMedia test above is the one that catches a
  // DELIVERY regression; this one pins the ordering CONTRACT precisely).
  it('applyStyleEffects: the synthetic grade fragment composes as the BASE, not the outer layer', () => {
    const frag = applyStyleEffects(
      registryWithLaterFilter,
      baseItem({ grade: { brightness: 1.2 }, effects: [{ type: 'brand-tint' }] } as Partial<VideoItem>),
      0,
      90,
    );
    expect(frag.filter).toBe('brightness(1.2) sepia(0.5)');
  });
});
