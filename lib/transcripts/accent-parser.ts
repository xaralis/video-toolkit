/**
 * A brand-declared accent slot key: whatever identifier the brand's
 * `accentSlots` declare. Core neither enumerates nor defaults the set.
 */
export type AccentColor = string;
export interface Token {
  text: string;
  color: AccentColor | null;
}

/**
 * Apply a brand's endpoint `.` rule: any trailing literal `.` outside an accent
 * block becomes an accented `.` in the accent slot the CALLER names. Authors
 * don't need to remember to wrap the endpoint — they write natural punctuation
 * and the brand styling is applied for them.
 *
 * `endpointKey` is a REQUIRED parameter with no default: core owns no accent
 * slot and must never inject one brand's key into another brand's text. Pass
 * the key the brand declares for its endpoint, or `undefined`/`''` to disable
 * the rule (a brand with no endpoint slot).
 *
 * Detection: a string ends with `.` only when the period is NOT inside an
 * accent block (accent blocks close with `}`). So a simple `endsWith('.')`
 * check is sufficient — no regex needed (examples use a brand key `sig`):
 *   - ("Bariéra pro lidi.", 'sig')  → "Bariéra pro lidi{sig:.}"
 *   - ("It takes {gold:little}.", 'sig') → "It takes {gold:little}{sig:.}"
 *   - ("{sig:Hello.}", 'sig')       → unchanged (ends with `}`)
 *   - ("Already{sig:.}", 'sig')     → unchanged (ends with `}`)
 *   - ("No period", 'sig')          → unchanged
 *   - ("Anything.", undefined)      → unchanged (rule disabled)
 *
 * Only `.` is auto-transformed. `!` and `?` are left as authorial signal.
 */
export function applyBrandEndpoint(text: string, endpointKey: string | undefined): string {
  if (!endpointKey) return text;
  if (!text.endsWith('.')) return text;
  return text.slice(0, -1) + `{${endpointKey}:.}`;
}

export function parseAccents(input: string): Token[] {
  // Any identifier-like key (letters/digits/underscore/hyphen, starting with
  // a letter) is a valid accent slot — brands declare their own key set, so
  // the parser hardcodes no key names at all.
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
