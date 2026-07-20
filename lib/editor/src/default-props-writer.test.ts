import { describe, expect, it } from 'vitest';
import { rewriteDefaultProps, readDefaultProps, updateDefaultPropsSurgically } from './default-props-writer';

const ROOT = `import { Composition } from 'remotion';
import { CampaignReel } from './CampaignReel';

export const RemotionRoot = () => {
  return (
    <Composition
      id="CampaignReel"
      component={CampaignReel}
      defaultProps={{
        topic: 'Demo',
        segments: [
          { id: 'seg-001', type: 'clip', source: 'sample.mp4', trimIn: 0, trimOut: 3 },
        ],
      }}
      calculateMetadata={({ props }) => ({ durationInFrames: 300 })}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
`;

describe('rewriteDefaultProps', () => {
  it('replaces defaultProps and round-trips through readDefaultProps', () => {
    const next = {
      topic: 'Nájmy',
      segments: [
        { id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 1, trimOut: 4 },
        { id: 'seg-002', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 3, audioMode: 'silent' },
      ],
    };
    const out = rewriteDefaultProps(ROOT, next);
    expect(readDefaultProps(out)).toEqual(next);
  });

  it('preserves the rest of the file', () => {
    const out = rewriteDefaultProps(ROOT, { topic: 'X', segments: [] });
    expect(out).toContain("import { CampaignReel } from './CampaignReel'");
    expect(out).toContain('calculateMetadata');
    expect(out).toContain('width={1080}');
  });
});

const TWO_COMPS = `import { Composition } from 'remotion';
export const Root = () => (
  <>
    <Composition id="A" component={A} defaultProps={{ topic: 'a' }} fps={30} width={1} height={1} />
    <Composition id="B" component={B} defaultProps={{ topic: 'b' }} fps={30} width={1} height={1} />
  </>
);
`;

describe('rewriteDefaultProps disambiguation & errors', () => {
  it('rewrites only the composition matching compositionId', () => {
    const out = rewriteDefaultProps(TWO_COMPS, { topic: 'B2' }, { compositionId: 'B' });
    expect(readDefaultProps(out, { compositionId: 'B' })).toEqual({ topic: 'B2' });
    expect(readDefaultProps(out, { compositionId: 'A' })).toEqual({ topic: 'a' });
  });

  it('throws when ambiguous and no compositionId given', () => {
    expect(() => rewriteDefaultProps(TWO_COMPS, { topic: 'x' })).toThrow(/disambiguate/);
  });

  it('throws when compositionId does not exist', () => {
    expect(() => rewriteDefaultProps(TWO_COMPS, { topic: 'x' }, { compositionId: 'Z' })).toThrow(
      /no <Composition> with id="Z"/,
    );
  });

  it('throws when there is no Composition at all', () => {
    expect(() => rewriteDefaultProps('export const x = 1;', {})).toThrow(/no <Composition>/);
  });
});

const AS_CONST_ROOT = `import { Composition } from 'remotion';
import { CampaignReel } from './CampaignReel';

export const RemotionRoot = () => {
  return (
    <Composition
      id="CampaignReel"
      component={CampaignReel}
      defaultProps={{
        topic: 'Demo',
        audioMode: 'silent' as const,
        segments: [
          { id: 's1', type: 'clip', trimIn: 0, trimOut: 3 },
        ] as const,
      }}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
`;

const AS_CONST_WHOLE_OBJECT_ROOT = `import { Composition } from 'remotion';
import { CampaignReel } from './CampaignReel';

export const RemotionRoot = () => {
  return (
    <Composition
      id="CampaignReel"
      component={CampaignReel}
      defaultProps={{
        topic: 'Demo',
        audioMode: 'silent',
      } as const}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
`;

const SATISFIES_ROOT = `import { Composition } from 'remotion';
import { CampaignReel } from './CampaignReel';

export const RemotionRoot = () => {
  return (
    <Composition
      id="CampaignReel"
      component={CampaignReel}
      defaultProps={{
        topic: 'Demo',
        audioMode: 'silent',
      } satisfies Record<string, unknown>}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
`;

describe('readDefaultProps with TypeScript type-assertion wrappers', () => {
  it('unwraps a scalar "as const" (audioMode) and a "as const" array (segments)', () => {
    expect(readDefaultProps(AS_CONST_ROOT, { compositionId: 'CampaignReel' })).toEqual({
      topic: 'Demo',
      audioMode: 'silent',
      segments: [{ id: 's1', type: 'clip', trimIn: 0, trimOut: 3 }],
    });
  });

  it('unwraps a whole-object "as const" wrapping the entire defaultProps literal', () => {
    expect(readDefaultProps(AS_CONST_WHOLE_OBJECT_ROOT, { compositionId: 'CampaignReel' })).toEqual({
      topic: 'Demo',
      audioMode: 'silent',
    });
  });

  it('unwraps a "satisfies" expression', () => {
    expect(readDefaultProps(SATISFIES_ROOT, { compositionId: 'CampaignReel' })).toEqual({
      topic: 'Demo',
      audioMode: 'silent',
    });
  });
});

const COMPUTED_KEY = `import { Composition } from 'remotion';
export const Root = () => (
  <Composition id="A" component={A} defaultProps={{ [k]: 'x' }} fps={30} width={1} height={1} />
);
`;

describe('evaluateLiteral safety', () => {
  it('throws on a computed property key instead of using the raw "[k]" source text as a key', () => {
    expect(() => readDefaultProps(COMPUTED_KEY)).toThrow(/computed property names are not supported/);
  });

  it('round-trips a literal own "__proto__" key as a plain enumerable data property, without touching the prototype', () => {
    // Constructed via JSON.parse so `__proto__` is an OWN property of the input, not a prototype
    // reassignment (a plain object literal `{ __proto__: 1 }` would instead set the prototype).
    const withProto = JSON.parse('{"topic":"x","__proto__":1}') as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(withProto, '__proto__')).toBe(true);

    const out = rewriteDefaultProps(ROOT, withProto);
    const result = readDefaultProps(out) as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
    expect(result.__proto__).toBe(1);
    expect(result.topic).toBe('x');
    // The result's actual prototype must remain Object.prototype — not reassigned to `1`.
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result).toEqual(withProto);
  });
});

const SURGICAL_ROOT = `import { Composition } from 'remotion';
import { CampaignReel } from './CampaignReel';

export const RemotionRoot = () => {
  return (
    <Composition
      id="CampaignReel"
      component={CampaignReel}
      defaultProps={{
        // reel meta
        topic: 'Klima' as const,
        chevron: 'KLIMA' as const,
        segments: [
          // ── Úsek 1 ──
          { id: 's1', type: 'clip' as const, trimIn: 0, trimOut: 3, overlays: [ { kind: 'quote-pull' as const, text: 'A {lime:b}.' } ] },
          { id: 's2', type: 'broll' as const, trimIn: 0, trimOut: 4 },
        ] as const,
      }}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
`;

describe('updateDefaultPropsSurgically', () => {
  it('changes only chevron, preserving comments and as const elsewhere', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = { ...current, chevron: 'DOPRAVA' };

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    expect(out).toContain('// reel meta');
    expect(out).toContain('// ── Úsek 1 ──');
    expect(out).toContain("topic: 'Klima' as const");
    expect(out).toContain('] as const');
    expect(out).toContain("type: 'clip' as const");
    expect(out).toContain("type: 'broll' as const");
    expect(out).toContain('"DOPRAVA" as const');
    expect(out).not.toContain('KLIMA');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('changes only segments[0].trimOut, preserving comments and as const elsewhere', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments[0].trimOut = 5;

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    expect(out).toContain('// reel meta');
    expect(out).toContain('// ── Úsek 1 ──');
    expect(out).toContain("topic: 'Klima' as const");
    expect(out).toContain("chevron: 'KLIMA' as const");
    expect(out).toContain("type: 'clip' as const");
    expect(out).toContain('trimOut: 5');
    expect(out).not.toContain('trimOut: 3');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('changes only segments[0].overlays[0].text, preserving comments and as const elsewhere', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments[0].overlays[0].text = 'X {teal:y}.';

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    expect(out).toContain('// reel meta');
    expect(out).toContain('// ── Úsek 1 ──');
    expect(out).toContain("kind: 'quote-pull' as const");
    expect(out).toContain('X {teal:y}.');
    expect(out).not.toContain('A {lime:b}.');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('returns the source unchanged when newProps is deep-equal to current props (no-op)', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    expect(out).toBe(SURGICAL_ROOT);
  });

  it('falls back to replacing the whole array when its length changes (documented limitation)', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments.push({ id: 's3', type: 'card', trimIn: 0, trimOut: 2 });

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    // Sibling top-level comments/as const survive; the segments array itself is fully regenerated
    // (adding/removing elements is not surgically diffable — see function doc comment).
    expect(out).toContain('// reel meta');
    expect(out).toContain("topic: 'Klima' as const");
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('round-trips through readDefaultProps on a plain (non-as-const) fixture', () => {
    const current = readDefaultProps(ROOT, { compositionId: undefined }) as any;
    const next = { ...current, topic: 'Nájmy' };

    const out = updateDefaultPropsSurgically(ROOT, next);

    expect(out).toContain("import { CampaignReel } from './CampaignReel'");
    expect(out).toContain('calculateMetadata');
    expect(readDefaultProps(out)).toEqual(next);
  });
});
