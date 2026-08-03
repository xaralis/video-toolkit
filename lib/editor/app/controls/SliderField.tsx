import { fieldCls, labelCls, disabledCls } from './field-classes';

// A range input plus a mono readout, sharing the same label/field classes as
// the rest of the inspector.
//
// No `htmlFor`/`id` pairing between the label and the input: `aria-label={lbl}`
// on the input already supplies the accessible name (and is what the test
// suite queries by), and an `id` derived from `lbl` text is neither unique
// (two `GradeFields` instances — the item-level grade and a grade effect —
// render in the same panel and would both mint `id="sl-Saturation"`) nor
// always valid HTML (labels like `Zoom (1 = none)` contain characters an
// `id`/`querySelector` can't carry).
export function SliderField({
  lbl, value, min, max, step, onCommit, disabled, title,
}: {
  lbl: string; value: number | undefined; min: number; max: number; step: number;
  onCommit: (n: number) => void; disabled?: boolean; title?: string;
}) {
  const v = value ?? min;
  return (
    <div className={fieldCls} title={title}>
      <div className="ed:flex ed:justify-between ed:mb-1">
        <label className={labelCls}>{lbl}</label>
        <span className="ed:text-[11px] ed:text-ink ed:font-mono ed:tabular-nums">{v}</span>
      </div>
      <input
        aria-label={lbl}
        type="range"
        className={disabled ? `ed:w-full ed:accent-accent ${disabledCls}` : 'ed:w-full ed:accent-accent'}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={v}
        onChange={(e) => onCommit(Number(e.target.value))}
      />
    </div>
  );
}
