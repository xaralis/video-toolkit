import { describe, expect, it } from 'vitest';
import { rewriteDefaultProps, readDefaultProps } from './default-props-writer';

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
