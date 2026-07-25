import { useLayoutEffect, useMemo, useRef } from 'react';
import { parseAccents } from '@video-toolkit/lib/transcripts/accent-parser';
import { runsToString, applyAccentToRange, type Run, type AccentColor } from './accent-runs';
import type { AccentSlot } from '../../theming/palette';
import styles from './AccentEditor.module.css';

/** The editor's accent palette entry IS a brand accent slot. */
export type AccentEditorColor = AccentSlot;

export interface AccentEditorProps {
  /** Encoded caption string, e.g. `Řízená {lime:péče}.` */
  value: string;
  /** Called with the new encoded string whenever the caption changes. */
  onChange: (next: string) => void;
  /**
   * Accent palette driving the toolbar buttons. Data-driven so a brand can
   * supply its own palette later; defaults to Lime + Teal.
   */
  colors?: AccentEditorColor[];
  /** Allow newlines (textarea-style). Default false = single-line caption. */
  multiline?: boolean;
}

const DEFAULT_COLORS: AccentEditorColor[] = [
  { key: 'lime', label: 'Lime', color: '#c6f432' },
  { key: 'teal', label: 'Teal', color: '#2ad4c5' },
];

/** Renders `value` into `root` as text nodes + accent spans (colored inline). */
function renderInto(root: HTMLElement, value: string, colorMap: Record<string, string>): void {
  const doc = root.ownerDocument;
  root.textContent = '';
  for (const run of parseAccents(value)) {
    if (run.text === '') continue;
    if (run.color === null) {
      root.appendChild(doc.createTextNode(run.text));
    } else {
      const span = doc.createElement('span');
      span.setAttribute('data-accent', run.color);
      const hex = colorMap[run.color];
      if (hex) span.style.color = hex;
      span.style.fontWeight = '600';
      span.textContent = run.text;
      root.appendChild(span);
    }
  }
}

/** Reads the editor DOM back into runs (accent color from the `data-accent` attr). */
function readRunsFromDom(root: HTMLElement): Run[] {
  const runs: Run[] = [];
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      runs.push({ text: node.textContent ?? '', color: null });
    } else if (node instanceof HTMLElement) {
      // A <br> (from a browser's own Enter handling) is a newline.
      if (node.nodeName === 'BR') {
        runs.push({ text: '\n', color: null });
        return;
      }
      const accent = node.getAttribute('data-accent');
      const color: AccentColor | null = accent ?? null;
      runs.push({ text: node.textContent ?? '', color });
    }
  });
  return runs;
}

/** Plain-text offset (UTF-16 code units) of a DOM (container, offset) boundary. */
function plainOffsetOf(root: HTMLElement, container: Node, offset: number): number {
  const range = root.ownerDocument.createRange();
  range.setStart(root, 0);
  range.setEnd(container, offset);
  return range.toString().length;
}

/** Current DOM selection expressed as plain-text offsets into the caption. */
function plainSelection(root: HTMLElement): { start: number; end: number } {
  const plainLen = (root.textContent ?? '').length;
  const sel = root.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0) return { start: plainLen, end: plainLen };
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) {
    return { start: plainLen, end: plainLen };
  }
  const a = plainOffsetOf(root, r.startContainer, r.startOffset);
  const b = plainOffsetOf(root, r.endContainer, r.endOffset);
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** Resolves a plain-text offset to a concrete DOM (textNode, offset) position. */
function locate(root: HTMLElement, target: number): { node: Node; offset: number } {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let last: Node | null = null;
  let n = walker.nextNode();
  while (n) {
    const len = (n.textContent ?? '').length;
    if (target <= acc + len) return { node: n, offset: target - acc };
    acc += len;
    last = n;
    n = walker.nextNode();
  }
  if (last) return { node: last, offset: (last.textContent ?? '').length };
  return { node: root, offset: 0 };
}

/** Restores a selection spanning the given plain-text offsets. */
function setPlainSelection(root: HTMLElement, start: number, end: number): void {
  const sel = root.ownerDocument.getSelection();
  if (!sel) return;
  const s = locate(root, start);
  const e = locate(root, end);
  const range = root.ownerDocument.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * AccentEditor — a WYSIWYG single-line caption editor for inline accent markup.
 *
 * Accented runs render in their accent color with NO braces visible, and
 * accents can neither nest nor overlap (enforced by `applyAccentToRange` on the
 * runs model). The toolbar applies/clears the accent of the current selection.
 *
 * Cursor stability: the contenteditable is kept UNCONTROLLED while the user
 * types. A `lastValue` ref tracks the string we last put into (or read out of)
 * the DOM; the sync effect only rewrites the DOM when an *external* `value`
 * differs from it, so React never re-renders the node mid-keystroke and the
 * caret never jumps.
 */
export function AccentEditor({ value, onChange, colors = DEFAULT_COLORS, multiline = false }: AccentEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string | null>(null);
  const colorMap = useMemo(() => Object.fromEntries(colors.map((c) => [c.key, c.color])), [colors]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only sync when the change came from OUTSIDE (not our own emit), so typing
    // doesn't trigger a DOM rewrite that would reset the caret.
    if (lastValue.current === value) return;
    renderInto(el, value, colorMap);
    lastValue.current = value;
  }, [value, colorMap]);

  const handleInput = () => {
    const el = ref.current;
    if (!el) return;
    const next = runsToString(readRunsFromDom(el));
    lastValue.current = next; // guard the sync effect against clobbering the caret
    onChange(next);
  };

  const applyColor = (color: AccentColor | null) => {
    const el = ref.current;
    if (!el) return;
    const current = runsToString(readRunsFromDom(el));
    const { start, end } = plainSelection(el);
    const next = applyAccentToRange(current, start, end, color);
    renderInto(el, next, colorMap);
    lastValue.current = next;
    setPlainSelection(el, start, end);
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // Single-line caption: swallow Enter. Multi-line quote-pull: insert a real
    // '\n' (rendered via white-space:pre-wrap) instead of the browser's own
    // <div>/<br> so the value round-trips cleanly.
    if (multiline) document.execCommand('insertText', false, '\n');
  };

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        {colors.map((c) => (
          <button
            key={c.key}
            type="button"
            className={styles.button}
            data-accent-button={c.key}
            // Keep the editor selection alive when the button takes focus.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyColor(c.key)}
          >
            <span
              aria-hidden="true"
              style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: c.color, marginRight: 6, verticalAlign: 'middle' }}
            />
            {c.label}
          </button>
        ))}
        <button
          type="button"
          className={styles.button}
          data-accent-button="clear"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyColor(null)}
        >
          Clear
        </button>
      </div>
      <div
        ref={ref}
        className={styles.content}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Caption text"
        aria-multiline={multiline}
        spellCheck={false}
        // Multi-line: render embedded '\n' as line breaks and give it room.
        style={multiline ? { whiteSpace: 'pre-wrap', minHeight: 64 } : undefined}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
