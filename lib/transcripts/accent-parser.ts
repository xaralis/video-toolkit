/**
 * A brand-declared accent slot key (e.g. `lime`, `teal`, or any brand-defined
 * identifier). Historically only `'lime' | 'teal'` were valid — PP's own
 * slots — but the slot set is now declared per-brand, so this is any string.
 */
export type AccentColor = string;
export interface Token {
  text: string;
  color: AccentColor | null;
}

/**
 * Apply the brand-signature endpoint `.` rule (#10): any trailing literal `.`
 * outside an accent block becomes an accented `.` in the given brand slot.
 * Authors don't need to remember to wrap the endpoint — they can write
 * natural Czech punctuation and the brand styling is applied automatically.
 *
 * Detection: a string ends with `.` only when the period is NOT inside an
 * accent block (accent blocks close with `}`). So a simple `endsWith('.')`
 * check is sufficient — no regex needed:
 *   - "Bariéra pro lidi."         → "Bariéra pro lidi{teal:.}"   (default slot)
 *   - "Stačí {lime:málo}."        → "Stačí {lime:málo}{teal:.}"
 *   - "{teal:Hello.}"             → unchanged (ends with `}`)
 *   - "Already{teal:.}"           → unchanged (ends with `}`)
 *   - "No period"                 → unchanged
 *
 * Only `.` is auto-transformed. `!` and `?` are left as authorial signal.
 *
 * `endpointKey` selects which brand slot wraps the endpoint:
 *   - omitted entirely → defaults to `'teal'` (PP's original, back-compat
 *     behavior for every existing single-arg call site).
 *   - passed explicitly as `undefined` or `''` → the rule is DISABLED and the
 *     text is returned unchanged (a brand with no endpoint slot).
 *   - passed as any other string → that key wraps the endpoint instead.
 *
 * The distinction between "omitted" and "explicitly undefined" is made via
 * the rest-tuple parameter (its length reflects the actual call arity), not
 * a plain default value, since JS default parameters can't tell those two
 * cases apart.
 */
export function applyBrandEndpoint(text: string, ...rest: [endpointKey?: string]): string {
  const endpointKey = rest.length === 0 ? 'teal' : rest[0];
  if (!endpointKey) return text;
  if (!text.endsWith('.')) return text;
  return text.slice(0, -1) + `{${endpointKey}:.}`;
}

export function parseAccents(input: string): Token[] {
  // Any identifier-like key (letters/digits/underscore/hyphen, starting with
  // a letter) is a valid accent slot — brands declare their own key set, so
  // the parser no longer hardcodes `lime|teal`.
  const pattern = /\{([A-Za-z][\w-]*):([^}]+)\}/g;
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const [full, color, phrase] = match;
    // Add text before the match
    tokens.push({ text: input.slice(lastIndex, match.index), color: null });
    // Add the colored phrase
    tokens.push({ text: phrase, color });
    lastIndex = match.index + full.length;
  }

  // No matches found - return the entire input as plain text
  if (tokens.length === 0) {
    return [{ text: input, color: null }];
  }

  // Add any remaining text after the last match
  tokens.push({ text: input.slice(lastIndex), color: null });

  return tokens;
}
