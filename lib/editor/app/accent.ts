// `AccentColor` has one declaration, in the accent-parser (the module that
// actually produces/consumes colored tokens for rendering); re-exported here
// so existing imports of `AccentColor` from this module keep working.
import type { AccentColor } from '@video-toolkit/lib/transcripts/accent-parser';
export type { AccentColor };

export interface AccentSelection {
  text: string;
  selStart: number;
  selEnd: number;
}

// Any brand-declared accent key — core declares no accent values of its own, so
// this must match the same open key grammar the accent parser uses
// (lib/transcripts/accent-parser.ts), not one brand's slot names.
// `([^}]+)`, not `([^}]*)`: the parser treats an EMPTY phrase (`{gold:}`) as
// plain text and renders the braces literally, so stripping it here would make
// a timeline label disagree with what is on screen.
const ACCENT_RE = /\{[A-Za-z][\w-]*:([^}]+)\}/g;

/**
 * wrapAccent — pure reducer for the "wrap selection in an accent" editor
 * action.
 *
 * Given the current field `text` and a selection range, wraps the selected
 * substring in the inline accent markup `{color:phrase}` and returns the
 * updated text plus a NEW selection range.
 *
 * Selection-range convention: the returned `selStart`/`selEnd` span the
 * freshly-inserted token INCLUDING its `{color:...}` wrapper (not just the
 * inner phrase), so a caller re-applying the range to a text input re-selects
 * the whole accent token it just created — handy for a follow-up action like
 * toggling the color without having to re-derive the phrase bounds.
 *
 * - Out-of-range bounds are clamped into `[0, text.length]`.
 * - A reversed range (`selStart > selEnd`) is swapped before use.
 * - An empty selection (`selStart === selEnd`, after clamping/swapping) is a
 *   no-op: `text` is returned unchanged with the same (clamped) range.
 * - No attempt is made to detect or merge an existing accent already
 *   spanning the selection — the raw selected substring is wrapped as-is,
 *   even if it happens to equal an existing `{key:...}` span.
 *   That merge/reconciliation is out of scope for this helper.
 */
export function wrapAccent(
  text: string,
  selStart: number,
  selEnd: number,
  color: AccentColor
): AccentSelection {
  const len = text.length;
  let start = Math.min(Math.max(selStart, 0), len);
  let end = Math.min(Math.max(selEnd, 0), len);
  if (start > end) {
    [start, end] = [end, start];
  }

  if (start === end) {
    return { text, selStart: start, selEnd: end };
  }

  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const wrapped = `{${color}:${selected}}`;

  return {
    text: before + wrapped + after,
    selStart: before.length,
    selEnd: before.length + wrapped.length,
  };
}

/**
 * stripAccents — removes `{key:...}` wrapper markup for ANY brand-declared
 * accent key, leaving only the inner phrase. Plain text with no accent markup is returned
 * unchanged.
 */
export function stripAccents(text: string): string {
  return text.replace(ACCENT_RE, '$1');
}
