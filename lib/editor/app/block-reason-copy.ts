import type { BlockReason } from '../src/timeline/block-reason';

export interface HintMessage {
  text: string;
  severity: 'info' | 'warn' | 'error';
}

/** The English sentence for each constraint. Deliberately in the APP layer:
 *  `src/timeline/block-reason.ts` is shared with non-UI consumers, and a
 *  user-facing sentence there would be in the wrong place.
 *
 *  Each one says what stopped AND, where it is not obvious, what to do about
 *  it. A message the user cannot act on is only marginally better than the
 *  silence this replaces. Kept short: the bar is one line and must not wrap. */
export const BLOCK_REASON_COPY: Record<BlockReason, HintMessage> = {
  'footage-head-exhausted': {
    text: 'Start of the source — there is no earlier footage in this file.',
    severity: 'info',
  },
  'footage-tail-exhausted': {
    text: 'End of the source — there is no more footage in this file.',
    severity: 'info',
  },
  'min-clip-length': {
    text: 'Minimum clip length reached.',
    severity: 'info',
  },
  'music-source-end': {
    text: 'End of the music file.',
    severity: 'info',
  },
  'timeline-start': {
    text: 'The music bed is pinned to the start of the reel.',
    severity: 'info',
  },
  'transition-handle-starved': {
    text: 'Neighbour has no footage left to lend — trim it back or shift the clip’s window.',
    severity: 'warn',
  },
};

export function hintForReason(reason: BlockReason): HintMessage {
  return BLOCK_REASON_COPY[reason];
}
