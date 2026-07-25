import {
  parseAccents,
  type Token,
  type AccentColor,
} from '@video-toolkit/lib/transcripts/accent-parser';

/**
 * A single stretch of caption text with an optional accent color. This is the
 * runs model the WYSIWYG AccentEditor operates on: `parseAccents` decodes the
 * inline `{color:phrase}` markup into runs, edit ops transform the runs, and
 * `runsToString` re-encodes them. By construction accents can neither nest nor
 * overlap — the string is always a flat sequence of runs.
 *
 * Structurally identical to the accent-parser's `Token`; aliased here so the
 * editor code reads in terms of "runs".
 */
export type Run = Token;
export type { AccentColor };

/**
 * runsToString — serialize a list of runs back to inline `{color:phrase}`
 * markup, the inverse of `parseAccents`.
 *
 * Normalizes on the way out so the encoded string is canonical:
 *  - empty runs (`text === ''`) are dropped,
 *  - adjacent runs of the same color are merged,
 *  - plain runs are emitted unwrapped; colored runs as `{color:text}`.
 *
 * Round-trips with `parseAccents`: `runsToString(parseAccents(s)) === s` for
 * any canonically-encoded `s`.
 */
export function runsToString(runs: Run[]): string {
  // Drop empties, then merge adjacent same-color runs.
  const merged: Run[] = [];
  for (const run of runs) {
    if (run.text === '') continue;
    const last = merged[merged.length - 1];
    if (last && last.color === run.color) {
      last.text += run.text;
    } else {
      merged.push({ text: run.text, color: run.color });
    }
  }

  return merged
    .map((run) => (run.color === null ? run.text : `{${run.color}:${run.text}}`))
    .join('');
}

/**
 * applyAccentToRange — set the accent of a PLAIN-TEXT range to `color` (or
 * clear it with `null`), returning the new encoded string.
 *
 * `selStart`/`selEnd` are offsets into the accent-stripped text the user sees
 * (UTF-16 code units, matching DOM selection offsets), NOT into the encoded
 * markup. The range is clamped to `[0, plain.length]` and a reversed range is
 * swapped; an empty range is a no-op (the value is returned re-normalized).
 *
 * Accents never nest and never overlap by construction: the value is decoded
 * to a per-character color array, the selected span is overwritten wholesale
 * (replacing whatever accent was there), and the array is regrouped into flat
 * runs. Any accent partially covered by the range is split; an accent fully
 * covered is replaced.
 */
export function applyAccentToRange(
  value: string,
  selStart: number,
  selEnd: number,
  color: AccentColor | null
): string {
  const runs = parseAccents(value);

  // Flatten to plain text + a per-character color array (UTF-16 code units).
  const chars: string[] = [];
  const colors: (AccentColor | null)[] = [];
  for (const run of runs) {
    for (let i = 0; i < run.text.length; i++) {
      chars.push(run.text[i]);
      colors.push(run.color);
    }
  }

  const len = chars.length;
  let start = Math.min(Math.max(selStart, 0), len);
  let end = Math.min(Math.max(selEnd, 0), len);
  if (start > end) [start, end] = [end, start];

  // Overwrite the selected span's color (splits/replaces existing accents).
  for (let i = start; i < end; i++) {
    colors[i] = color;
  }

  // Regroup consecutive same-color characters into runs.
  const rebuilt: Run[] = [];
  for (let i = 0; i < len; i++) {
    const last = rebuilt[rebuilt.length - 1];
    if (last && last.color === colors[i]) {
      last.text += chars[i];
    } else {
      rebuilt.push({ text: chars[i], color: colors[i] });
    }
  }

  return runsToString(rebuilt);
}
