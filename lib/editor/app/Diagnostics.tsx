import { useState } from 'react';
import type { Diagnostic } from './LayeredTimeline';
import { CircleCheckIcon, CircleDotIcon, TriangleAlertIcon } from './icons';

export type StatusChipState = 'clean' | 'unsaved' | 'issue';

/** Severity order when states overlap: an issue always wins the chip (it is
 *  the only state that can hide a fact silently otherwise — dirty is ALSO
 *  visible independently via the enabled, accent-filled Save button, so
 *  losing the chip to red costs nothing). Clean only when there is neither. */
export function statusChipState(items: Diagnostic[], dirty: boolean): StatusChipState {
  if (items.length > 0) return 'issue';
  if (dirty) return 'unsaved';
  return 'clean';
}

/** The box every state renders into. Deliberately has NO colour class of its
 *  own — only size/shape — so the three states can never differ in it. See
 *  `Diagnostics.test.tsx` for the assertion that actually proves this. */
const CHIP_BOX_CLASS =
  'ed:relative ed:inline-flex ed:items-center ed:justify-center ed:w-8 ed:h-8 ed:shrink-0 ed:rounded-md ed:border ed:bg-transparent ed:cursor-pointer';

const CHIP_STATE_CLASS: Record<StatusChipState, string> = {
  clean: 'ed:border-success ed:text-success',
  unsaved: 'ed:border-warn ed:text-warn',
  issue: 'ed:border-danger ed:text-danger',
};

function issueLabel(count: number): string {
  return count === 1 ? '1 issue' : `${count} issues`;
}

/** The single header health/status chip: one fixed-size box, three states —
 *  clean (saved), unsaved (dirty), issue (a diagnostic exists) — told apart
 *  by BOTH icon shape and colour (never colour alone: that fails for
 *  colour-blind users). Folds the old standalone diagnostics badge and the
 *  old separate "● Unsaved" text into one indicator, because a document has
 *  one health, not two competing readouts of it.
 *
 *  Severity wins when states overlap: issue (red) outranks unsaved (orange).
 *  When both are true the chip goes red, but its tooltip/popup states BOTH
 *  facts — unsaved-ness must never go silently unmentioned just because an
 *  issue also exists. (Save's own accent fill is the other, independent
 *  signal of unsaved-ness, which is what makes ceding the chip to red safe.)
 *
 *  The detail popup — click-to-select-the-offending-item — is exactly what
 *  the old `DiagnosticsBadge` did, preserved here: `onSelect` still fires
 *  with the diagnostic's `targetId` on a real reel with many boundaries. */
export function StatusChip({ items, dirty, onSelect }: { items: Diagnostic[]; dirty: boolean; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const state = statusChipState(items, dirty);
  const hasIssues = items.length > 0;

  const accessibleName = hasIssues ? issueLabel(items.length) : state === 'unsaved' ? 'Unsaved changes' : 'Saved';
  const tooltip = [
    hasIssues ? issueLabel(items.length) : null,
    // Both facts, always — an issue must never make unsaved-ness invisible.
    dirty ? 'Unsaved changes' : null,
    ...items.map((d) => d.message),
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');

  return (
    <div className="ed:relative">
      <button
        type="button"
        onClick={() => hasIssues && setOpen((v) => !v)}
        title={tooltip}
        aria-label={accessibleName}
        className={`${CHIP_BOX_CLASS} ${CHIP_STATE_CLASS[state]}`}
      >
        {state === 'issue' ? (
          <TriangleAlertIcon size={15} />
        ) : state === 'unsaved' ? (
          <CircleDotIcon size={15} />
        ) : (
          <CircleCheckIcon size={15} />
        )}
      </button>
      {open && hasIssues && (
        // Anchored RIGHT. This was left-anchored on the reasoning that "the
        // chip sits well left of the viewport's right edge" — true when the
        // chip lived beside the project name, false the moment it moved into
        // the action zone next to Discard/Save, where it sits ~200px from the
        // right edge and a 320px-wide panel opening rightwards is simply cut
        // off. Anchoring to the chip's right edge makes the panel grow into
        // the pane rather than out of it, which holds for any chip position
        // in this zone.
        //
        // The arrow makes this read as attached to the chip rather than a
        // detached toast floating over the video.
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 20 }}>
          <div
            aria-hidden
            style={{
              // Mirrors the panel's right anchoring, so the arrow stays under
              // the chip instead of pointing at empty space.
              position: 'absolute', top: -6, right: 12, width: 10, height: 10,
              background: '#232428', border: '1px solid #b4503f', borderRight: 'none', borderBottom: 'none',
              transform: 'rotate(45deg)',
            }}
          />
          <ul style={{ position: 'relative', listStyle: 'none', padding: 4, minWidth: 320, maxWidth: '70vw', background: '#232428', border: '1px solid #b4503f', borderRadius: 4, boxShadow: '0 6px 18px rgba(0,0,0,0.5)' }}>
            {dirty && (
              <li style={{ padding: '5px 7px', color: '#f0d8d2', fontWeight: 600 }}>Unsaved changes</li>
            )}
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
        </div>
      )}
    </div>
  );
}
