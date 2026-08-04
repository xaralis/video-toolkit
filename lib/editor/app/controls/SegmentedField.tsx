import { fieldCls, labelCls, disabledCls } from './field-classes';

export function SegmentedField({
  lbl, value, options, onChange, optionLabel, disabled, optionDisabled, optionTitle, optionAriaLabel,
}: {
  lbl: string; value: string | undefined; options: string[];
  onChange: (s: string) => void; optionLabel?: (v: string) => string; disabled?: boolean;
  /** Disables a single tile rather than the whole group — e.g. "Position in
   *  frame" greying out under `fit: 'cover'` while "Crop & zoom" stays live.
   *  Composes with `disabled` (either one disables that tile). */
  optionDisabled?: (v: string) => boolean;
  /** Overrides the tooltip for one tile — used to explain WHY a per-option
   *  disabled tile is unavailable, rather than just repeating its label. */
  optionTitle?: (v: string) => string | undefined;
  /** Overrides a tile's accessible name — needed when the same visible text
   *  appears elsewhere in the panel (e.g. a "Crop & zoom" tile here AND a
   *  "Crop & zoom" Collapsible section header), which would otherwise leave
   *  two controls indistinguishable to a screen reader (and to
   *  `getByRole('button', { name })` in tests). Must still contain the
   *  visible label text, not replace it, per WCAG 2.5.3. */
  optionAriaLabel?: (v: string) => string | undefined;
}) {
  return (
    <div className={fieldCls}>
      <label className={`${labelCls} ed:block ed:mb-1`}>{lbl}</label>
      <div className="ed:flex ed:gap-1" role="group" aria-label={lbl}>
        {options.map((o) => {
          const on = o === value;
          const text = optionLabel ? optionLabel(o) : o;
          const isDisabled = disabled || optionDisabled?.(o) === true;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              aria-label={optionAriaLabel?.(o)}
              disabled={isDisabled}
              // The label truncates (`ed:truncate`) at narrow widths — a
              // `title` is the only way the full text stays reachable, since
              // there's no room for a second, untruncated copy on screen.
              // `optionTitle` overrides this with a stated reason when the
              // tile is individually disabled.
              title={optionTitle?.(o) ?? text}
              onClick={() => onChange(o)}
              className={`ed:flex-1 ed:min-w-0 ed:truncate ed:h-7 ed:px-2 ed:text-[11px] ed:rounded ed:border ed:border-line ${
                isDisabled ? disabledCls : 'ed:cursor-pointer'
              } ${on ? 'ed:bg-accent ed:text-accent-ink' : 'ed:bg-control ed:text-ink-2'}`}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
