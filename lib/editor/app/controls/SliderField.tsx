import { fieldCls, labelCls, disabledCls, resetBtnCls, resetSpacerCls } from './field-classes';
import { RotateCcwIcon } from '../icons';

// A range input plus a mono readout, sharing the same label/field classes as
// the rest of the inspector.
//
// No `htmlFor`/`id` pairing between the label and the input: `aria-label={lbl}`
// on the input already supplies the accessible name (and is what the test
// suite queries by), and an `id` derived from `lbl` text is neither
// guaranteed unique (nothing stops two controls sharing a label — e.g. a
// future second `GradeFields` caller — from both minting `id="sl-Saturation"`
// in the same panel) nor always valid HTML (labels like `Zoom (1 = none)`
// contain characters an `id`/`querySelector` can't carry).
export function SliderField({
  lbl, value, min, max, step, fallback, defaultValue, onReset, onCommit, disabled, title,
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
  /** The value the reset affordance returns the field to. Defaults to
   *  `fallback` — for nearly every slider here the render-time default IS
   *  what an unset value already displays, so stating `fallback` once gives
   *  the reset button "for free". Pass it explicitly only when the two
   *  genuinely differ. */
  defaultValue?: number;
  /** Called instead of `onCommit(defaultValue)` when reset is clicked, when
   *  provided — e.g. to DELETE the field's key from a parent bag rather than
   *  writing its default value back in literally, so an untouched field
   *  leaves no entry in the saved config (see the Color section's grade
   *  fields, the reason this exists). */
  onReset?: () => void;
  onCommit: (n: number) => void; disabled?: boolean; title?: string;
}) {
  const v = value ?? fallback;
  const resolvedDefault = defaultValue ?? fallback;
  const showReset = v !== resolvedDefault;
  const reset = () => (onReset ? onReset() : onCommit(resolvedDefault));
  return (
    <div className={fieldCls} title={title}>
      <div className="ed:flex ed:items-center ed:justify-between ed:mb-1">
        <label className={labelCls}>{lbl}</label>
        <div className="ed:flex ed:items-center ed:gap-1">
          <span className="ed:text-[11px] ed:text-ink ed:font-mono ed:tabular-nums">{v}</span>
          {showReset ? (
            <button type="button" aria-label={`Reset ${lbl}`} title={`Reset ${lbl}`} onClick={reset} className={resetBtnCls}>
              <RotateCcwIcon size={11} />
            </button>
          ) : (
            <span className={resetSpacerCls} aria-hidden="true" />
          )}
        </div>
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
