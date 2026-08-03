import { SHORTCUTS, type ShortcutGroup } from './shortcuts';

/** Pointer gestures. Not in SHORTCUTS because they are not keydown events —
 *  but they belong in the same list, because "what can I do here" does not
 *  care which event type carries it. */
export const GESTURES: readonly { keys: string; label: string }[] = [
  { keys: '⌘ + scroll', label: 'Zoom the timeline' },
  { keys: '⌥ + drag', label: 'Slip the shot inside its window' },
];

const ORDER: ShortcutGroup[] = ['Playback', 'Editing', 'Timeline', 'File', 'Help'];

export function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      data-testid="shortcut-backdrop"
      onClick={onClose}
      className="ed:fixed ed:inset-0 ed:z-50 ed:flex ed:items-center ed:justify-center ed:bg-black/60"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ed:bg-panel ed:border ed:border-line ed:rounded-xl ed:p-6 ed:max-h-[80vh] ed:overflow-y-auto ed:min-w-[420px]"
      >
        <h2 className="ed:text-sm ed:font-semibold ed:text-ink ed:mb-4">Keyboard shortcuts</h2>
        {ORDER.map((g) => {
          const rows = SHORTCUTS.filter((s) => s.group === g);
          if (!rows.length) return null;
          return (
            <div key={g} className="ed:mb-4">
              <div className="ed:text-[10px] ed:text-ink-3 ed:uppercase ed:tracking-wider ed:mb-1.5">{g}</div>
              {rows.map((s) => (
                <div key={s.id} className="ed:flex ed:justify-between ed:gap-6 ed:py-0.5">
                  <span className="ed:text-xs ed:text-ink-2">{s.label}</span>
                  <span className="ed:text-xs ed:text-ink ed:font-mono">{s.keys}</span>
                </div>
              ))}
            </div>
          );
        })}
        <div>
          <div className="ed:text-[10px] ed:text-ink-3 ed:uppercase ed:tracking-wider ed:mb-1.5">Gestures</div>
          {GESTURES.map((g) => (
            <div key={g.keys} className="ed:flex ed:justify-between ed:gap-6 ed:py-0.5">
              <span className="ed:text-xs ed:text-ink-2">{g.label}</span>
              <span className="ed:text-xs ed:text-ink ed:font-mono">{g.keys}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
