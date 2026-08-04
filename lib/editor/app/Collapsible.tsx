import { useState, type ReactNode, type CSSProperties } from 'react';
import { ChevronRightIcon, ChevronDownIcon } from './icons';

// A reusable collapsible section (accordion row): a clickable header with a
// disclosure chevron + title + an optional right-aligned slot (e.g. a remove
// button), over a body that shows only when open. Used for clip effects in the
// inspector, but deliberately generic so any grouped inspector content can use
// it. Uncontrolled by default (tracks its own open state); pass `defaultOpen`.
const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
  userSelect: 'none',
  padding: '7px 0',
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
  children,
}: {
  title: ReactNode;
  /** Right-aligned header slot (e.g. a ✕ remove button). Its clicks don't toggle. */
  right?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid #23252b' }}>
      <div
        style={headerStyle}
        role="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ display: 'inline-flex' }}>
          {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
        </span>
        <span style={{ flex: 1 }}>{title}</span>
        {right && (
          // Stop toggling when interacting with the right slot (e.g. remove ✕).
          <span onClick={(e) => e.stopPropagation()}>{right}</span>
        )}
      </div>
      {open && <div style={{ paddingBottom: 6 }}>{children}</div>}
    </div>
  );
}
