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
  lbl, value, min, max, step, fallback, onCommit, disabled, title,
}: {
  lbl: string; value: number | undefined; min: number; max: number; step: number;
  /** What an UNSET value renders as — the value the RENDERER will actually use
   *  for this field when it's absent, not the control's floor. Required
   *  rather than defaulted to `min`: `min` is a bound on the CONTROL, not a
   *  claim about what "unset" means to the renderer, and the two silently
   *  drifting apart is exactly the regression this prop exists to prevent
   *  (a live-at-unity audio bed rendering as pinned to −60dB/muted). Every
   *  call site states it explicitly — see the six sites fixed alongside this
   *  prop's introduction for what "explicit" caught. */
  fallback: number;
  onCommit: (n: number) => void; disabled?: boolean; title?: string;
}) {
  const v = value ?? fallback;
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
