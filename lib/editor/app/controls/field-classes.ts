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

// The small, quiet reset-to-default icon button `SliderField`/`ScrubField`
// show next to a field once its value has drifted from `defaultValue` (and
// the equivalent "reset all" button on the Color section's `Collapsible`
// header) — sized to sit beside the value readout without shifting the row's
// layout when it appears/disappears (see `resetSpacerCls`, the fixed-size
// placeholder shown in its place otherwise).
export const resetBtnCls =
  'ed:inline-flex ed:items-center ed:justify-center ed:w-[15px] ed:h-[15px] ed:rounded ed:text-ink-3 ed:cursor-pointer ed:hover:text-ink ed:hover:bg-control';

// Same footprint as `resetBtnCls`, invisible — reserves the reset button's
// space so a field's row doesn't reflow the instant its value crosses back
// over its default.
export const resetSpacerCls = 'ed:inline-block ed:w-[15px] ed:h-[15px]';

// The "still has changes" mark a section's `Collapsible` header shows once
// it's touched but the user has manually collapsed it — so a non-empty
// section never reads as empty. Decorative only (`aria-hidden`); the
// computed state (`hasGradeChanges`, an effect count) is the source of truth,
// this is just what makes it visible at a glance. The Color section uses the
// plain dot (nothing to count); Effects shows its own count instead (see
// `countBadgeCls` below) — same mechanism, a different natural badge shape.
export const dirtyDotCls = 'ed:inline-block ed:w-1.5 ed:h-1.5 ed:rounded-full ed:bg-accent';

export const countBadgeCls =
  'ed:inline-flex ed:items-center ed:justify-center ed:min-w-[14px] ed:h-[14px] ed:px-1 ed:rounded-full ed:bg-line-strong ed:text-ink-3 ed:text-[9px] ed:font-mono ed:leading-none';
