import { useState } from 'react';
import type { Diagnostic } from './LayeredTimeline';

/** A count in the header that expands into the list. Deliberately NOT a
 *  permanently open panel: on a healthy project it is empty, and it should not
 *  cost timeline height for nothing. Clicking an entry selects the offending
 *  boundary — on a reel with thirty cuts a hatched block outside the viewport
 *  is invisible, so this list is the index into them.
 *
 *  WARNING colours, not an accent and not grey. "Brand-neutral" forbids reaching
 *  for a brand's accent slot; it does not require an error to be invisible, and
 *  amber-on-dark is universal UI semantics rather than anybody's brand
 *  vocabulary. An earlier revision was neutral grey and, in a real editor, read
 *  as a disabled chip — the badge is the ONLY unmissable surface this feature
 *  has, so it has to look like something is wrong. */
export function DiagnosticsBadge({ items, onSelect }: { items: Diagnostic[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div style={{ position: 'relative', fontSize: 11 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={items.map((d) => d.message).join('\n')}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: '#7a2e24', color: '#ffe9e2', border: '1px solid #b4503f',
          borderRadius: 3, padding: '3px 9px', cursor: 'pointer', font: 'inherit', fontWeight: 600,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
        }}
      >
        <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>⚠</span>
        {items.length} {items.length === 1 ? 'issue' : 'issues'}
      </button>
      {open && (
        // Anchored LEFT: the badge sits beside the project name at the far left
        // of the header, so a right-anchored panel runs off the pane and clips
        // the start of every message — which is where the numbers are.
        <ul style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20, listStyle: 'none', padding: 4, minWidth: 320, maxWidth: '70vw', background: '#232428', border: '1px solid #b4503f', borderRadius: 4, boxShadow: '0 6px 18px rgba(0,0,0,0.5)' }}>
          {items.map((d, i) => (
            <li key={i}>
              <button
                onClick={() => d.targetId && onSelect(d.targetId)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#f0d8d2', padding: '5px 7px', cursor: d.targetId ? 'pointer' : 'default', font: 'inherit', whiteSpace: 'normal' }}
              >
                {d.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
