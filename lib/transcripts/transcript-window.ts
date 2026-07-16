export interface Word {
  start: number;
  end: number;
  word: string;
}

export interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: Word[];
}

export interface Transcript {
  language: string;
  duration: number;
  segments: Segment[];
}

export function transcriptWindow(
  t: Transcript,
  trimIn: number,
  trimOut: number
): Word[] {
  const out: Word[] = [];
  for (const seg of t.segments) {
    if (seg.end < trimIn || seg.start > trimOut) continue;
    for (const w of seg.words) {
      if (w.end < trimIn || w.start > trimOut) continue;
      out.push({
        start: Math.max(0, w.start - trimIn),
        end: Math.max(0, w.end - trimIn),
        word: w.word,
      });
    }
  }
  return out;
}
