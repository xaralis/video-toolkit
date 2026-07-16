import { Composition } from 'remotion';
import { WebProgramIntro } from './WebProgramIntro';
import { buildReelConfig, fps, width, height } from './config/reel-config';
import { WebProgramIntroConfigSchema } from './config/schema';
import { totalDurationFrames } from '../../../lib/reel-config-base/duration';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="WebProgramIntro"
      component={WebProgramIntro}
      schema={WebProgramIntroConfigSchema}
      // Defaults are spelled out as an inline literal so Remotion Studio's
      // Save button can write changes back here. Real projects replace this
      // entire defaultProps block via /cut after authoring SCREENPLAY.md.
      defaultProps={{
        programNumber: 1,
        programSlug: 'placeholder',
        programTitle: 'Placeholder',
        targetDurationSec: 60,
        segments: [
          { id: 'seg-001', type: 'clip' as const, source: 'sample.mp4', trimIn: 0, trimOut: 5 },
        ],
      }}
      calculateMetadata={({ props }) => {
        const config = buildReelConfig(props);
        return {
          durationInFrames: Math.max(
            60,
            totalDurationFrames(config.segments, fps, 0),
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
