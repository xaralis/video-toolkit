// Shared class constants for inspector-style fields, used by `LayeredInspector.tsx`
// and every control in this directory. Kept in one place so a field never
// silently drifts from its neighbour after a later edit — see the callers for
// why each one is shaped the way it is.

export const fieldCls = 'ed:mb-2 ed:flex-1 ed:min-w-0';

// Deliberately carries no `display` or `mb-*` of its own — a checkbox's label
// needs `flex`/margin-bottom 0 and every other label needs `block`/margin-bottom
// 1, and stacking two utilities for the SAME property (two `display`s, two
// `margin-bottom`s) on one element depends on stylesheet emission order rather
// than class-attribute order. Each consumer states both explicitly instead
// (see the non-checkbox `${labelCls} ed:block ed:mb-1` call sites and
// `CheckboxField`, which adds `ed:flex` and no margin).
export const labelCls = 'ed:text-[11px] ed:text-ink-2';

export const inputCls =
  'ed:w-full ed:box-border ed:bg-control ed:text-ink ed:border ed:border-line ed:rounded ed:px-2 ed:py-1 ed:text-xs';

// A value the user reads (not a label about it) — must stay in `ink`/`ink-2`,
// never `ink-3`: `ink-3` at 12px is below WCAG AA against the shell.
export const readonlyValueCls = 'ed:text-xs ed:text-ink ed:font-mono';

export const rowCls = 'ed:flex ed:gap-2';

export const disabledCls = 'ed:opacity-45 ed:cursor-not-allowed';

// A section/group heading within a panel — smaller and quieter than a field
// label, never a value the user reads (hence `ink-3` is correct here, unlike
// `readonlyValueCls` above). Shared between `LayeredInspector.tsx` (its
// "Format"/"Content" section headers) and `ShortcutOverlay.tsx` (its group
// headers, e.g. "Playback"/"Editing") — previously the exact same literal
// duplicated in both files, which is exactly the drift-after-a-later-edit
// hazard this module exists to avoid (see the file-level comment above).
export const sectionCls = 'ed:text-[10px] ed:text-ink-3 ed:uppercase ed:tracking-wider ed:mt-2.5 ed:mb-1.5';
