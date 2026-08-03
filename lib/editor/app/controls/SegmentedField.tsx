import { fieldCls, labelCls } from './field-classes';

export function SegmentedField({
  lbl, value, options, onChange, optionLabel,
}: {
  lbl: string; value: string | undefined; options: string[];
  onChange: (s: string) => void; optionLabel?: (v: string) => string;
}) {
  return (
    <div className={fieldCls}>
      <label className={`${labelCls} ed:block ed:mb-1`}>{lbl}</label>
      <div className="ed:flex ed:gap-1" role="group" aria-label={lbl}>
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o)}
              className={`ed:flex-1 ed:min-w-0 ed:truncate ed:h-7 ed:px-2 ed:text-[11px] ed:rounded ed:border ed:border-line ed:cursor-pointer ${
                on ? 'ed:bg-accent ed:text-accent-ink' : 'ed:bg-control ed:text-ink-2'
              }`}
            >
              {optionLabel ? optionLabel(o) : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
