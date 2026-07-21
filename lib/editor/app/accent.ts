export type AccentColor = string;

export interface AccentSelection {
  text: string;
  selStart: number;
  selEnd: number;
}

const ACCENT_RE = /\{(?:lime|teal):([^}]*)\}/g;

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
 *   even if it happens to equal an existing `{lime:...}`/`{teal:...}` span.
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
 * stripAccents — removes `{lime:...}`/`{teal:...}` wrapper markup, leaving
 * only the inner phrase. Plain text with no accent markup is returned
 * unchanged.
 */
export function stripAccents(text: string): string {
  return text.replace(ACCENT_RE, '$1');
}
