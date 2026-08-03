import { fieldCls, labelCls } from './field-classes';

// A range input plus a mono readout, sharing the same label/field classes as
// the rest of the inspector.
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
        <label htmlFor={`sl-${lbl}`} className={labelCls}>{lbl}</label>
        <span className="ed:text-[11px] ed:text-ink ed:font-mono ed:tabular-nums">{v}</span>
      </div>
      <input
        id={`sl-${lbl}`}
        aria-label={lbl}
        type="range"
        className="ed:w-full ed:accent-accent"
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
