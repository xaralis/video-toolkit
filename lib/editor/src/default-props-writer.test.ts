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
          // ── Úsek 2 ──
          { id: 's2', type: 'broll' as const, trimIn: 0, trimOut: 4 },
          // ── Úsek 3 ──
          { id: 's3', type: 'card' as const, trimIn: 0, trimOut: 6 },
        ] as const,
      }}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
`;

// Byte-exact source of each segment, including its OWN leading comment and indentation. Asserting
// on these (rather than only on the comment text) is what proves an untouched neighbour came back
// verbatim instead of being re-serialized/re-indented with the same values.
const S1_VERBATIM = `
          // ── Úsek 1 ──
          { id: 's1', type: 'clip' as const, trimIn: 0, trimOut: 3, overlays: [ { kind: 'quote-pull' as const, text: 'A {lime:b}.' } ] },`;
const S2_VERBATIM = `
          // ── Úsek 2 ──
          { id: 's2', type: 'broll' as const, trimIn: 0, trimOut: 4 },`;
const S3_VERBATIM = `
          // ── Úsek 3 ──
          { id: 's3', type: 'card' as const, trimIn: 0, trimOut: 6 },`;

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

  it('surgically appends a new array element without reserializing the existing elements', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments.push({ id: 's4', type: 'card', trimIn: 0, trimOut: 2 });

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    // Sibling top-level comments/as const survive, AND (unlike the old whole-array-
    // replace fallback) the untouched existing elements + the array's own `as const`
    // wrapper survive too — only the new element is inserted.
    expect(out).toContain('// reel meta');
    expect(out).toContain("topic: 'Klima' as const");
    expect(out).toContain('// ── Úsek 1 ──');
    expect(out).toContain('// ── Úsek 2 ──');
    expect(out).toContain('// ── Úsek 3 ──');
    expect(out).toContain("type: 'clip' as const");
    expect(out).toContain("type: 'broll' as const");
    expect(out).toContain("kind: 'quote-pull' as const");
    expect(out).toContain('] as const');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('surgically prepends a new element at index 0, keeping the (neighbouring) first element\'s comment', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments.unshift({ id: 's0', type: 'card', trimIn: 0, trimOut: 1 });

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    // Every existing element keeps its OWN leading comment — including s1, whose
    // comment sits exactly at the insertion point and must not be consumed by the
    // newly inserted element.
    expect(out).toContain('// ── Úsek 1 ──');
    expect(out).toContain('// ── Úsek 2 ──');
    expect(out).toContain('// ── Úsek 3 ──');
    // The comment must still be attached to s1, not stranded above the new element — and every
    // existing element comes back byte-for-byte, indentation included.
    expect(out).toContain(S1_VERBATIM);
    expect(out).toContain(S2_VERBATIM);
    expect(out).toContain(S3_VERBATIM);
    expect(out.indexOf('"id": "s0"')).toBeLessThan(out.indexOf('// ── Úsek 1 ──'));
    expect(out).toContain("type: 'clip' as const");
    expect(out).toContain("kind: 'quote-pull' as const");
    expect(out).toContain('] as const');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('surgically inserts a new element in the middle of an array, preserving every existing element\'s comments and as const', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments.splice(1, 0, { id: 's1b', type: 'card', trimIn: 0, trimOut: 1 });

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    // s1 (with its leading comment and nested as-const overlay) is untouched...
    expect(out).toContain('// ── Úsek 1 ──');
    expect(out).toContain("type: 'clip' as const");
    expect(out).toContain("kind: 'quote-pull' as const");
    expect(out).toContain('A {lime:b}.');
    // ...s2 sits AT the insertion point and must keep its own comment...
    expect(out).toContain(S2_VERBATIM);
    // ...s3 (after the insertion point) is untouched...
    expect(out).toContain(S3_VERBATIM);
    expect(out).toContain(S1_VERBATIM);
    // ...the array's own `as const` wrapper survives (the array node itself was
    // never wholesale-replaced)...
    expect(out).toContain('] as const');
    // ...and the new element is actually there (freshly serialized as JSON, double-quoted).
    expect(out).toContain('"id": "s1b"');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('surgically deletes an array element, preserving the surviving elements\' comments and as const', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments.splice(1, 1); // drop s2, keep s1 + s3

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    // The surviving elements (s1, s3) — including their leading comments and s1's
    // nested as-const overlay — are untouched, proving the deletion is surgical
    // rather than a whole-array reserialize. The deleted element takes its OWN
    // comment with it and leaves its neighbours' alone.
    expect(out).toContain(S1_VERBATIM);
    expect(out).toContain(S3_VERBATIM);
    expect(out).not.toContain('// ── Úsek 2 ──');
    expect(out).toContain("type: 'clip' as const");
    expect(out).toContain("kind: 'quote-pull' as const");
    expect(out).toContain('A {lime:b}.');
    expect(out).toContain("type: 'card' as const");
    expect(out).toContain('] as const');
    expect(out).not.toContain('s2');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('applies a leaf edit AND a disjoint insert in the same array without reserializing the untouched elements', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    // One realistic Save: nudge s1's trim, then duplicate/insert a clip at index 2.
    next.segments[0].trimOut = 5;
    next.segments.splice(2, 0, { id: 's2b', type: 'card', trimIn: 0, trimOut: 1 });

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    // s1 was edited in place: only its trimOut changed, its comment + nested
    // as-const overlay survive (it was NOT swallowed by the insert's edit run).
    expect(out).toContain('// ── Úsek 1 ──');
    expect(out).toContain("type: 'clip' as const");
    expect(out).toContain("kind: 'quote-pull' as const");
    expect(out).toContain('A {lime:b}.');
    expect(out).toContain('trimOut: 5');
    // s2 sits between the two edits and must come back byte-for-byte.
    expect(out).toContain(S2_VERBATIM);
    // s3 sits at the insertion point and must keep its own comment, byte-for-byte.
    expect(out).toContain(S3_VERBATIM);
    expect(out).toContain('"id": "s2b"');
    expect(out).toContain('] as const');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('applies two disjoint inserts in the same array in one call', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments.splice(2, 0, { id: 'x2', type: 'card', trimIn: 0, trimOut: 1 });
    next.segments.splice(1, 0, { id: 'x1', type: 'card', trimIn: 0, trimOut: 1 });

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    expect(out).toContain(S1_VERBATIM);
    expect(out).toContain(S2_VERBATIM);
    expect(out).toContain(S3_VERBATIM);
    expect(out).toContain('] as const');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('applies a delete and a disjoint insert in the same array in one call', () => {
    const current = readDefaultProps(SURGICAL_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments.push({ id: 's9', type: 'card', trimIn: 0, trimOut: 2 });
    next.segments.splice(1, 1); // drop s2

    const out = updateDefaultPropsSurgically(SURGICAL_ROOT, next, { compositionId: 'CampaignReel' });

    expect(out).toContain(S1_VERBATIM);
    expect(out).not.toContain('// ── Úsek 2 ──');
    // s3 keeps its comment; only its trailing comma differs now that an element follows it.
    expect(out).toContain('// ── Úsek 3 ──');
    expect(out).toContain("{ id: 's3', type: 'card' as const, trimIn: 0, trimOut: 6 }");
    expect(out).toContain("kind: 'quote-pull' as const");
    expect(out).toContain("type: 'clip' as const");
    expect(out).toContain('] as const');
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

const ADD_KEY_ROOT = `import { Composition } from 'remotion';
import { CampaignReel } from './CampaignReel';

export const RemotionRoot = () => {
  return (
    <Composition
      id="CampaignReel"
      component={CampaignReel}
      defaultProps={{
        topic: 'Klima' as const,
        segments: [
          // ── Úsek 1 ──
          { id: 's1', type: 'clip' as const, trimIn: 0, trimOut: 3, focalX: 0.85, audioMode: 'voice' as const },
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

const NESTED_ADD_KEY_ROOT = `import { Composition } from 'remotion';
import { CampaignReel } from './CampaignReel';

export const RemotionRoot = () => {
  return (
    <Composition
      id="CampaignReel"
      component={CampaignReel}
      defaultProps={{
        topic: 'Klima' as const,
        segments: [
          // ── Úsek 1 ──
          { id: 's1', type: 'clip' as const, trimIn: 0, trimOut: 3, crop: { x: 0.1 }, audioMode: 'voice' as const },
        ] as const,
      }}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
`;

describe('updateDefaultPropsSurgically — adding a new key (superset)', () => {
  it('inserts a new key into an existing object literal, preserving siblings’ comments + as const', () => {
    const current = readDefaultProps(ADD_KEY_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments[0].focalY = 0.3;

    const out = updateDefaultPropsSurgically(ADD_KEY_ROOT, next, { compositionId: 'CampaignReel' });

    expect(out).toContain('focalY: 0.3');
    expect(out).toContain("type: 'clip' as const");
    expect(out).toContain("audioMode: 'voice' as const");
    expect(out).toContain('// ── Úsek 1 ──');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('applies a value change AND a new key in the same object in one call, both surgically', () => {
    const current = readDefaultProps(ADD_KEY_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments[0].trimOut = 5;
    next.segments[0].focalY = 0.3;

    const out = updateDefaultPropsSurgically(ADD_KEY_ROOT, next, { compositionId: 'CampaignReel' });

    expect(out).toContain('trimOut: 5');
    expect(out).not.toContain('trimOut: 3');
    expect(out).toContain('focalY: 0.3');
    expect(out).toContain("type: 'clip' as const");
    expect(out).toContain("audioMode: 'voice' as const");
    expect(out).toContain('// ── Úsek 1 ──');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('inserts a new key into a nested object literal (crop.y), preserving outer as const/comments', () => {
    const current = readDefaultProps(NESTED_ADD_KEY_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    next.segments[0].crop.y = 0.2;

    const out = updateDefaultPropsSurgically(NESTED_ADD_KEY_ROOT, next, { compositionId: 'CampaignReel' });

    expect(out).toContain('y: 0.2');
    expect(out).toContain('x: 0.1');
    expect(out).toContain("type: 'clip' as const");
    expect(out).toContain("audioMode: 'voice' as const");
    expect(out).toContain('// ── Úsek 1 ──');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });

  it('still falls back to whole-node replace when a key is removed (value-wise correct)', () => {
    const current = readDefaultProps(ADD_KEY_ROOT, { compositionId: 'CampaignReel' }) as any;
    const next = JSON.parse(JSON.stringify(current));
    delete next.segments[0].focalX;

    const out = updateDefaultPropsSurgically(ADD_KEY_ROOT, next, { compositionId: 'CampaignReel' });

    // Whole-node replace only touches s1; sibling top-level props/comments still survive.
    expect(out).toContain("topic: 'Klima' as const");
    expect(out).toContain('// ── Úsek 1 ──');
    expect(readDefaultProps(out, { compositionId: 'CampaignReel' })).toEqual(next);
  });
});
