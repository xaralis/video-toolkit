import { useId, useState, type ReactNode, type CSSProperties } from 'react';
import { ChevronRightIcon, ChevronDownIcon } from './icons';

// A reusable collapsible section (accordion row): a clickable header with a
// disclosure chevron + title + an optional right-aligned slot (e.g. a remove
// button), over a body that shows only when open. Used for clip effects in the
// inspector, but deliberately generic so any grouped inspector content can use
// it. Uncontrolled by default (tracks its own open state); pass `defaultOpen`.
//
// The header row is a plain, non-interactive container — NOT itself a
// `role="button"`. The toggle is a real `<button>` wrapping only the chevron +
// title; `right` is a SIBLING of that button, not a descendant. This used to
// be a `<div role="button">` with `right` nested inside it (guarded by an
// `onClick` `stopPropagation` so a nested `<button>` in `right` — e.g. a
// "reset all" or a remove ✕ — didn't also toggle the section). That was an
// ARIA/HTML violation with two real consequences: the header's accessible
// name was computed from ALL of its contents, so a labelled button in `right`
// got absorbed into it (Color's header read as "Color Reset all color
// adjustments", not "Color" — LayeredInspector.test.tsx had to route around
// it via `getByText('Color').closest('[role="button"]')` instead of
// `getByRole('button', { name: 'Color' })`), and nested interactive content
// inside a `role="button"` isn't reliably reachable by keyboard or announced
// correctly by assistive tech. With `right` moved OUTSIDE the toggle button,
// a click on it never reaches the toggle's DOM subtree in the first place —
// no bubbling to intercept — so the `stopPropagation` this used to need is
// gone too.
const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 0',
};

const toggleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flex: 1,
  minWidth: 0,
  cursor: 'pointer',
  userSelect: 'none',
  // Reset `<button>`'s UA chrome (background/border/font) back to plain text
  // so it reads exactly like the old `<div role="button">` did.
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  textAlign: 'left',
  color: '#c8cbd2',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

export function Collapsible({
  title,
  right,
  defaultOpen = false,
  id,
  children,
}: {
  title: ReactNode;
  /** Right-aligned header slot (e.g. a ✕ remove button, a section-level
   *  reset). A SIBLING of the toggle button — its own clicks never reach the
   *  toggle, so nothing here needs to guard against also opening/closing the
   *  section. */
  right?: ReactNode;
  defaultOpen?: boolean;
  /** A readable prefix for the panel's generated DOM id — e.g. the same
   *  string the caller already uses as this element's React `key`
   *  (`color-${id}`, `effects-${id}`) — purely so the id is debuggable in the
   *  DOM. NOT what makes the id unique: `useId()` below does that on its
   *  own, guaranteed by React regardless of what (or whether) a caller passes
   *  here, which is what actually prevents two sibling `Collapsible`s from
   *  colliding (a previous round hit a genuine duplicate-*React*-key
   *  collision from two sibling sections sharing a bare `id` — see the Color/
   *  Effects sections' own comments in LayeredInspector.tsx). Optional: the
   *  per-effect Collapsible has no natural readable id beyond a list index.
   */
  id?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reactId = useId();
  const panelId = `collapsible-panel-${id ? `${id}-` : ''}${reactId}`;
  return (
    <div style={{ borderTop: '1px solid #23252b' }}>
      <div style={headerRowStyle}>
        <button
          type="button"
          style={toggleStyle}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <span style={{ display: 'inline-flex' }}>
            {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
          </span>
          <span>{title}</span>
        </button>
        {right && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{right}</span>}
      </div>
      {open && (
        <div id={panelId} style={{ paddingBottom: 6 }}>
          {children}
        </div>
      )}
    </div>
  );
}
