import { Composition } from 'remotion';
import { CampaignReel } from './CampaignReel';
import { buildReelConfig, fps, width, height, outroFrames } from './config/reel-config';
import { ReelConfigSchema } from './config/schema';
import { totalDurationFrames } from '../../../lib/reel-config-base/duration';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CampaignReel"
      component={CampaignReel}
      schema={ReelConfigSchema}
      // NOTE: defaults inlined as a hardcoded literal so Remotion Studio's
      // Save button can write changes back here. Imported references won't
      // save — https://remotion.dev/docs/visual-editing#requirements
      //
      // This minimal demo exercises the schema end-to-end. Real projects
      // overwrite this entire defaultProps={{...}} block via /cut after
      // authoring SCREENPLAY.md.
      defaultProps={{
        topic: 'Demo',
        chevron: 'PROGRAM',
        segments: [
          { id: 'seg-001', type: 'clip', source: 'sample.mp4', trimIn: 0, trimOut: 3 },
          {
            id: 'seg-002',
            type: 'broll',
            source: 'sample-broll.mp4',
            trimIn: 0,
            trimOut: 3,
            audioMode: 'silent',
          },
          { id: 'seg-003', type: 'outro' },
        ],
      }}
      calculateMetadata={({ props }) => {
        const config = buildReelConfig(props);
        return {
          durationInFrames: Math.max(
            60,
            totalDurationFrames(config.segments, fps, outroFrames),
          ),
        };
      }}
      durationInFrames={300}
      fps={fps}
      width={width}
      height={height}
    />
  );
};
