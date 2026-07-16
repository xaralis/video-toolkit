import { AbsoluteFill } from 'remotion';
import type { CardSegment as CardSegmentType } from '../config/types';
import { ClaimPlate } from './plates/ClaimPlate';

interface Props { segment: CardSegmentType; chevron: string; }

export const CardSegment: React.FC<Props> = ({ segment, chevron }) => {
  let plate: React.ReactNode = null;
  if (segment.kind === 'claim-plate') {
    plate = (
      <ClaimPlate
        lines={(segment.props.lines as string[]) ?? []}
        pattern={segment.pattern ?? 'pixels'}
      />
    );
  }
  // other plate kinds (program-plate, contrast-plate, stats-plate) deferred
  return (
    <AbsoluteFill>
      {plate}
    </AbsoluteFill>
  );
};
