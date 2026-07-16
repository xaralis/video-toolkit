export type AccentColor = 'lime' | 'teal';
export interface Token {
  text: string;
  color: AccentColor | null;
}

/**
 * Apply the brand-signature endpoint `.` rule (#10): any trailing literal `.`
 * outside an accent block becomes a teal `.`. Authors don't need to remember
 * to wrap the endpoint — they can write natural Czech punctuation and the
 * brand styling is applied automatically.
 *
 * Detection: a string ends with `.` only when the period is NOT inside an
 * accent block (accent blocks close with `}`). So a simple `endsWith('.')`
 * check is sufficient — no regex needed:
 *   - "Bariéra pro lidi."         → "Bariéra pro lidi{teal:.}"
 *   - "Stačí {lime:málo}."        → "Stačí {lime:málo}{teal:.}"
 *   - "{teal:Hello.}"             → unchanged (ends with `}`)
 *   - "Already{teal:.}"           → unchanged (ends with `}`)
 *   - "No period"                 → unchanged
 *
 * Only `.` is auto-transformed. `!` and `?` are left as authorial signal.
 */
export function applyBrandEndpoint(text: string): string {
  if (!text.endsWith('.')) return text;
  return text.slice(0, -1) + '{teal:.}';
}

export function parseAccents(input: string): Token[] {
  const pattern = /\{(lime|teal):([^}]+)\}/g;
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const [full, color, phrase] = match;
    // Add text before the match
    tokens.push({ text: input.slice(lastIndex, match.index), color: null });
    // Add the colored phrase
    tokens.push({ text: phrase, color: color as AccentColor });
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
