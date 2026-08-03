import { useState } from 'react';
import type { Diagnostic } from './LayeredTimeline';

/** A count in the header that expands into the list. Deliberately NOT a
 *  permanently open panel: on a healthy project it is empty, and it should not
 *  cost timeline height for nothing. Clicking an entry selects the offending
 *  boundary — on a reel with thirty cuts a hatched block outside the viewport
 *  is invisible, so this list is the index into them.
 *
 *  Neutral greys only: core is brand-neutral, and signalling through an accent
 *  colour would pull brand vocabulary into lib/. */
export function DiagnosticsBadge({ items, onSelect }: { items: Diagnostic[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div style={{ position: 'relative', fontSize: 11 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: '#3a3a3d', color: '#e8e8ea', border: '1px solid #5a5a5e', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', font: 'inherit' }}
      >
        {items.length} {items.length === 1 ? 'issue' : 'issues'}
      </button>
      {open && (
        <ul style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20, listStyle: 'none', padding: 4, minWidth: 280, background: '#232428', border: '1px solid #3a3c42', borderRadius: 4 }}>
          {items.map((d, i) => (
            <li key={i}>
              <button
                onClick={() => d.targetId && onSelect(d.targetId)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#d8d8da', padding: '4px 6px', cursor: d.targetId ? 'pointer' : 'default', font: 'inherit' }}
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
