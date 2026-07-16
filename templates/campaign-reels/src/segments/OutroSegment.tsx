import { AbsoluteFill, OffthreadVideo, Audio, staticFile } from 'remotion';

export const OutroSegment: React.FC = () => {
  return (
    <AbsoluteFill>
      <OffthreadVideo src={staticFile('brand/outro.mp4')} muted />
      <Audio src={staticFile('brand/outro.mp3')} />
    </AbsoluteFill>
  );
};
