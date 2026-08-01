import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Phase 4 Task 3.1 — BASELINE of the crop + ken-burns + grade MERGE.
//
// `ken-burns-parity.test.ts` pins kenBurnsStyle's OWN output. This file pins
// something different and complementary: what SegmentMedia emits when a crop,
// a ken-burns and a grade all land on the SAME media element together. That
// merge is what Workstream 3 rebuilds, so it is pinned here FIRST, against
// today's behaviour, so the rebuild can be PROVEN parity-preserving rather
// than assumed to be.
//
// HOW THE LITERALS WERE DERIVED: by RUNNING this exact matrix against the
// current code and recording what it actually emitted — never hand-computed.
// That is why they carry full IEEE floating-point noise
// (`1.0966666666666667`, `25.36762393375318%`). A hand-rounded value would pin
// a baseline that was never real. If one of these changes, re-derive it from a
// fresh run and justify the delta; do not "tidy" a float.
//
// EXACT STRINGS ONLY — no `toContain`, no `toBeCloseTo`. A baseline whose
// assertions are substring-shaped would let a reordering (of the transform
// chain or of the filter chain) through, and reordering is precisely the risk
// this file exists to catch: neither a CSS transform list nor a CSS filter
// chain is commutative.
// ---------------------------------------------------------------------------

const frameState = vi.hoisted(() => ({ frame: 0 }));
const captured = vi.hoisted(() => ({ img: [] as any[], video: [] as any[] }));

// Same mocking pattern as segment-media.test.tsx: SegmentMedia calls Remotion
// hooks and renders Img/OffthreadVideo, none of which work outside a real
// composition. The mocked elements render a REAL DOM node here (the existing
// test's return null) so the wbDef <svg>'s position relative to the media
// element is observable in the container.
vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => frameState.frame,
    useVideoConfig: () => ({ fps: 30 }),
    staticFile: (s: string) => s,
    Img: (props: any) => {
      captured.img.push(props);
      return <img data-testid="media" />;
    },
    OffthreadVideo: (props: any) => {
      captured.video.push(props);
      return <video data-testid="media" />;
    },
  };
});

import { SegmentMedia } from '@video-toolkit/lib/theming/segment/SegmentMedia';

// --- the matrix inputs -----------------------------------------------------
// One photo item, one fixed frame. endMs 3000 @ 30fps with no handles => 90
// durationInFrames; frame 25 sits mid-ramp on BOTH ken-burns shapes, so an
// off-by-one in either ramp shows up rather than being masked by a clamped
// endpoint.
const FRAME = 25;

const CROP = { width: 0.5, x: 0.3, y: 0.7 } as const;
const KB_DIRECTION = { type: 'ken-burns', direction: 'left' } as const;
// MINOR, closed (Task 3.2 review, round 1 — brief's own wording): before this
// addition only `direction: 'left'` was exercised, and 'in' emits NO
// translate (kenBurnsStyle's `x`/`y` are both 0 unless direction is
// 'left'/'up' — see ../../theming/effects/ken-burns.ts). Because `scale(A)
// scale(B)` commutes visually regardless of concatenation order while
// `scale(A) translate(x,y)` does not, 'left' is what makes ORDER a real
// picture-level fact; 'in' alone would let a reordering regression pass
// unnoticed on the picture even though this file's EXACT-STRING assertions
// would still catch it as a string diff. Adding 'in' widens the exact-string
// pin to the OTHER branch of the direction shorthand. This ADDS a cell; it
// does not touch any existing assertion.
const KB_DIRECTION_IN = { type: 'ken-burns', direction: 'in' } as const;
const KB_FROMTO = {
  type: 'ken-burns',
  fromX: 0.2,
  toX: 0.8,
  fromY: 0.1,
  toY: 0.9,
  fromScale: 1.05,
  toScale: 1.35,
} as const;
const GRADE = { brightness: 1.1, contrast: 1.2, saturation: 0.9 } as const;
const GRADE_WB = { ...GRADE, temperature: 0.4, tint: -0.25 } as const;

const crops: Array<[string, any]> = [
  ['no crop', undefined],
  ['crop', CROP],
];
const kenBurnses: Array<[string, any]> = [
  ['no ken-burns', undefined],
  ['direction ken-burns', KB_DIRECTION],
  ['from/to ken-burns', KB_FROMTO],
  ['direction ken-burns (in)', KB_DIRECTION_IN],
];
const grades: Array<[string, any]> = [
  ['no grade', undefined],
  ['grade', GRADE],
  ['grade + white-balance', GRADE_WB],
];

// --- the merged values, read out of the running code -----------------------
const CROP_POS = '30% 70%'; // cropCoverStyle: crop.x/crop.y win over focalX/focalY
const FOCAL_POS = '30% 80%'; // no crop: focalX/focalY alone
const KB_FROMTO_POS = '31.525717950314885% 25.36762393375318%';
const KB_DIRECTION_TRANSFORM = 'scale(1.0966666666666667) translate(-16.666666666666668px, 0px)';
// Derived by RUNNING kenBurnsStyle, same rule as every other literal here —
// see the module comment. `direction: 'in'` at frame 25/90 → scale
// 1.08 + (25/90)*0.12, translate(0px, 0px) (neither 'left' nor 'up').
const KB_DIRECTION_IN_TRANSFORM = 'scale(1.1133333333333335) translate(0px, 0px)';
const KB_FROMTO_TRANSFORM = 'scale(1.1076285897515745)';
const FILTER = 'brightness(1.1) contrast(1.2) saturate(0.9)';
// url(#…) is APPENDED — it runs last in the chain, after the three native
// filter functions. Its position is load-bearing: a filter chain is applied
// left to right, so white-balancing before vs. after a contrast/saturate
// boost are different pictures.
const FILTER_WB = 'brightness(1.1) contrast(1.2) saturate(0.9) url(#grade-m1)';

type Merged = {
  transform: string | undefined;
  objectPosition: string | undefined;
  transformOrigin: string | undefined;
  filter: string | undefined;
};

// Keyed `crop | ken-burns | grade`. Every one of the 18 cells is present; no
// cell of this matrix is impossible to construct (crop, effects and grade are
// independent optional fields on the same VideoItem).
const EXPECTED: Record<string, Merged> = {
  // -- no crop ----------------------------------------------------------
  'no crop | no ken-burns | no grade': {
    transform: undefined,
    objectPosition: FOCAL_POS,
    transformOrigin: undefined,
    filter: undefined,
  },
  'no crop | no ken-burns | grade': {
    transform: undefined,
    objectPosition: FOCAL_POS,
    transformOrigin: undefined,
    filter: FILTER,
  },
  'no crop | no ken-burns | grade + white-balance': {
    transform: undefined,
    objectPosition: FOCAL_POS,
    transformOrigin: undefined,
    filter: FILTER_WB,
  },
  // The direction shorthand emits a transform but NO objectPosition, so the
  // focal objectPosition survives — and transformOrigin stays undefined (CSS
  // default 50% 50%), because with no crop there was never one to keep.
  'no crop | direction ken-burns | no grade': {
    transform: KB_DIRECTION_TRANSFORM,
    objectPosition: FOCAL_POS,
    transformOrigin: undefined,
    filter: undefined,
  },
  'no crop | direction ken-burns | grade': {
    transform: KB_DIRECTION_TRANSFORM,
    objectPosition: FOCAL_POS,
    transformOrigin: undefined,
    filter: FILTER,
  },
  'no crop | direction ken-burns | grade + white-balance': {
    transform: KB_DIRECTION_TRANSFORM,
    objectPosition: FOCAL_POS,
    transformOrigin: undefined,
    filter: FILTER_WB,
  },
  'no crop | from/to ken-burns | no grade': {
    transform: KB_FROMTO_TRANSFORM,
    objectPosition: KB_FROMTO_POS,
    transformOrigin: KB_FROMTO_POS,
    filter: undefined,
  },
  'no crop | from/to ken-burns | grade': {
    transform: KB_FROMTO_TRANSFORM,
    objectPosition: KB_FROMTO_POS,
    transformOrigin: KB_FROMTO_POS,
    filter: FILTER,
  },
  'no crop | from/to ken-burns | grade + white-balance': {
    transform: KB_FROMTO_TRANSFORM,
    objectPosition: KB_FROMTO_POS,
    transformOrigin: KB_FROMTO_POS,
    filter: FILTER_WB,
  },
  // ADDED (Task 3.2 review, round 1, MINOR — see KB_DIRECTION_IN above): the
  // 'in' branch of the direction shorthand, not exercised before this.
  'no crop | direction ken-burns (in) | no grade': {
    transform: KB_DIRECTION_IN_TRANSFORM,
    objectPosition: FOCAL_POS,
    transformOrigin: undefined,
    filter: undefined,
  },
  'no crop | direction ken-burns (in) | grade': {
    transform: KB_DIRECTION_IN_TRANSFORM,
    objectPosition: FOCAL_POS,
    transformOrigin: undefined,
    filter: FILTER,
  },
  'no crop | direction ken-burns (in) | grade + white-balance': {
    transform: KB_DIRECTION_IN_TRANSFORM,
    objectPosition: FOCAL_POS,
    transformOrigin: undefined,
    filter: FILTER_WB,
  },
  // -- crop -------------------------------------------------------------
  'crop | no ken-burns | no grade': {
    transform: 'scale(2)',
    objectPosition: CROP_POS,
    transformOrigin: CROP_POS,
    filter: undefined,
  },
  'crop | no ken-burns | grade': {
    transform: 'scale(2)',
    objectPosition: CROP_POS,
    transformOrigin: CROP_POS,
    filter: FILTER,
  },
  'crop | no ken-burns | grade + white-balance': {
    transform: 'scale(2)',
    objectPosition: CROP_POS,
    transformOrigin: CROP_POS,
    filter: FILTER_WB,
  },
  // Crop's scale comes FIRST, ken-burns' is concatenated after it. Transform
  // lists are applied right to left, so swapping these two is a different
  // picture whenever a translate is in play — as it is here.
  'crop | direction ken-burns | no grade': {
    transform: `scale(2) ${KB_DIRECTION_TRANSFORM}`,
    objectPosition: CROP_POS,
    transformOrigin: CROP_POS,
    filter: undefined,
  },
  'crop | direction ken-burns | grade': {
    transform: `scale(2) ${KB_DIRECTION_TRANSFORM}`,
    objectPosition: CROP_POS,
    transformOrigin: CROP_POS,
    filter: FILTER,
  },
  'crop | direction ken-burns | grade + white-balance': {
    transform: `scale(2) ${KB_DIRECTION_TRANSFORM}`,
    objectPosition: CROP_POS,
    transformOrigin: CROP_POS,
    filter: FILTER_WB,
  },
  // ***** THE PAIRING CELLS — see the dedicated test below. *****
  'crop | from/to ken-burns | no grade': {
    transform: `scale(2) ${KB_FROMTO_TRANSFORM}`,
    objectPosition: KB_FROMTO_POS,
    transformOrigin: KB_FROMTO_POS,
    filter: undefined,
  },
  'crop | from/to ken-burns | grade': {
    transform: `scale(2) ${KB_FROMTO_TRANSFORM}`,
    objectPosition: KB_FROMTO_POS,
    transformOrigin: KB_FROMTO_POS,
    filter: FILTER,
  },
  'crop | from/to ken-burns | grade + white-balance': {
    transform: `scale(2) ${KB_FROMTO_TRANSFORM}`,
    objectPosition: KB_FROMTO_POS,
    transformOrigin: KB_FROMTO_POS,
    filter: FILTER_WB,
  },
  // ADDED (Task 3.2 review, round 1, MINOR — see KB_DIRECTION_IN above).
  'crop | direction ken-burns (in) | no grade': {
    transform: `scale(2) ${KB_DIRECTION_IN_TRANSFORM}`,
    objectPosition: CROP_POS,
    transformOrigin: CROP_POS,
    filter: undefined,
  },
  'crop | direction ken-burns (in) | grade': {
    transform: `scale(2) ${KB_DIRECTION_IN_TRANSFORM}`,
    objectPosition: CROP_POS,
    transformOrigin: CROP_POS,
    filter: FILTER,
  },
  'crop | direction ken-burns (in) | grade + white-balance': {
    transform: `scale(2) ${KB_DIRECTION_IN_TRANSFORM}`,
    objectPosition: CROP_POS,
    transformOrigin: CROP_POS,
    filter: FILTER_WB,
  },
};

// MINOR, closed (Task 3.2 review, round 1): guard that EXPECTED has exactly
// one entry per matrix cell — computed from the axis arrays themselves
// (crops × kenBurnses × grades), not a hardcoded count, so it stays correct
// as cells are added (as just happened above) rather than going stale. A
// missing or an orphaned EXTRA key in EXPECTED was previously invisible: the
// `describe.each`-style loop below only ever looks UP a key from EXPECTED, it
// never iterates EXPECTED's own keys, so a stale key sits there unchecked and
// a missing one silently gets `undefined` compared via `.toEqual` (which
// would still fail — see the note in the loop below for what this guard adds
// on top of that: an EXTRA key, not a missing one).
it('EXPECTED has exactly one entry per matrix cell — no stale or orphaned key', () => {
  expect(Object.keys(EXPECTED)).toHaveLength(crops.length * kenBurnses.length * grades.length);
});

function renderCell(crop: any, kb: any, grade: any) {
  captured.img.length = 0;
  captured.video.length = 0;
  const { container } = render(
    <SegmentMedia
      item={
        {
          id: 'm1',
          kind: 'photo',
          startMs: 0,
          endMs: 3000,
          source: 'photos/a.jpg',
          focalX: 0.3,
          focalY: 0.8,
          ...(crop ? { crop } : {}),
          ...(grade ? { grade } : {}),
          ...(kb ? { effects: [kb] } : {}),
        } as any
      }
      handles={{ inHalf: 0, outHalf: 0 }}
    />,
  );
  const style = captured.img[0].style;
  const merged: Merged = {
    transform: style.transform,
    objectPosition: style.objectPosition,
    transformOrigin: style.transformOrigin,
    filter: style.filter,
  };
  return { merged, container };
}

beforeEach(() => {
  frameState.frame = FRAME;
  captured.img.length = 0;
  captured.video.length = 0;
});

describe('SegmentMedia merge baseline: crop x ken-burns x grade', () => {
  for (const [cropName, crop] of crops) {
    for (const [kbName, kb] of kenBurnses) {
      for (const [gradeName, grade] of grades) {
        const key = `${cropName} | ${kbName} | ${gradeName}`;
        it(key, () => {
          expect(renderCell(crop, kb, grade).merged).toEqual(EXPECTED[key]);
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// THE PAIRING. Do not "simplify" this test away, and do not split its two
// assertions into separate per-property checks — the pairing is the point.
//
// SegmentMedia sets `objectPosition` and `transformOrigin` TOGETHER: the
// from/to ken-burns branch that supplies an objectPosition also REPLACES
// transformOrigin, discarding the crop's. The naive per-property merge — keep
// the crop's transformOrigin, take the ken-burns' objectPosition — is the
// obvious way to write the refactor and it is WRONG: it shifts the zoom pivot
// on every cropped photo, looks almost right, and passes any test that checks
// the two properties independently.
//
// This is the cell that catches it.
// ---------------------------------------------------------------------------
describe('objectPosition and transformOrigin move as a PAIR', () => {
  it('crop + from/to ken-burns: the ken-burns replaces BOTH, the crop keeps NEITHER', () => {
    const { merged } = renderCell(CROP, KB_FROMTO, undefined);
    expect(merged.objectPosition).toBe(KB_FROMTO_POS);
    // Not CROP_POS ('30% 70%'). Both moved; the crop's origin is gone.
    expect(merged.transformOrigin).toBe(KB_FROMTO_POS);
    expect(merged.transformOrigin).toBe(merged.objectPosition);
  });

  it('crop + DIRECTION ken-burns: neither moves, because that branch supplies no objectPosition', () => {
    const { merged } = renderCell(CROP, KB_DIRECTION, undefined);
    expect(merged.objectPosition).toBe(CROP_POS);
    expect(merged.transformOrigin).toBe(CROP_POS);
  });
});

// ---------------------------------------------------------------------------
// wbDef: presence, contents, and ORDER.
// ---------------------------------------------------------------------------
describe('wbDef presence and order', () => {
  const WB_MATRIX = '1.12 0 0 0 0  0 1.05 0 0 0  0 0 0.88 0 0  0 0 0 1 0';

  it('is absent for every grade without temperature/tint, and for no grade at all', () => {
    expect(renderCell(CROP, KB_FROMTO, undefined).container.querySelectorAll('svg')).toHaveLength(0);
    expect(renderCell(CROP, KB_FROMTO, GRADE).container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('renders exactly one wbDef, BEFORE the media element, with the id the filter chain references', () => {
    const { container } = renderCell(CROP, KB_FROMTO, GRADE_WB);
    const kids = Array.from(container.children).map((el) => el.tagName.toLowerCase());
    // Order: the <defs> must precede the element whose filter references it.
    expect(kids).toEqual(['svg', 'img']);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('filter')?.getAttribute('id')).toBe('grade-m1');
    expect(container.querySelector('filter')?.getAttribute('color-interpolation-filters')).toBe('sRGB');
    expect(container.querySelector('feColorMatrix')?.getAttribute('type')).toBe('matrix');
    expect(container.querySelector('feColorMatrix')?.getAttribute('values')).toBe(WB_MATRIX);
  });

  it('the same ordering holds for a video-backed item (OffthreadVideo branch)', () => {
    captured.video.length = 0;
    const { container } = render(
      <SegmentMedia
        item={
          {
            id: 'm1',
            kind: 'clip',
            startMs: 0,
            endMs: 3000,
            source: 'recordings/a.mp4',
            sourceInMs: 0,
            sourceOutMs: 3000,
            crop: CROP,
            grade: GRADE_WB,
            effects: [KB_FROMTO],
          } as any
        }
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );
    expect(Array.from(container.children).map((el) => el.tagName.toLowerCase())).toEqual(['svg', 'video']);
    expect(captured.video[0].style.filter).toBe(FILTER_WB);
  });

  it('url(#…) is LAST in the filter chain, after the native filter functions', () => {
    const { merged } = renderCell(undefined, undefined, GRADE_WB);
    expect(merged.filter).toBe(FILTER_WB);
    // Stated as an ordering fact too, so the reason the literal looks the way
    // it does survives a future edit to the grade values.
    expect(merged.filter!.split(' ').pop()).toBe('url(#grade-m1)');
  });

  it('a white-balance-only grade emits url(#…) as the WHOLE chain', () => {
    const { merged, container } = renderCell(undefined, undefined, { temperature: 0.4 });
    expect(merged.filter).toBe('url(#grade-m1)');
    expect(container.querySelector('feColorMatrix')?.getAttribute('values')).toBe(
      '1.12 0 0 0 0  0 1 0 0 0  0 0 0.88 0 0  0 0 0 1 0',
    );
  });
});
