import { useRef } from 'react';
import { useLiveField } from './use-live-field';
import { scrubValue } from './scrub-value';
import { fieldCls, labelCls, inputCls, disabledCls } from './field-classes';

// Renders a text input (not `type="number"` — the spinner and locale-decimal
// behaviour are exactly what this control removes), plus a drag handle on the
// label. `inputMode="decimal"` keeps mobile keyboards numeric-friendly without
// reintroducing the native number input's quirks.
export function ScrubField({
  lbl, value, step = 1, min, max, onCommit, disabled, title,
}: {
  lbl: string; value: number | undefined; step?: number; min?: number; max?: number;
  onCommit: (n: number) => void; disabled?: boolean; title?: string;
}) {
  const f = useLiveField(value === undefined ? '' : String(value));
  const drag = useRef<{ x0: number; v0: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || value === undefined) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, v0: value };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    onCommit(scrubValue(d.v0, e.clientX - d.x0, step, { min, max, fine: e.shiftKey }));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current) (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  return (
    <div className={fieldCls} title={title}>
      <label
        className={`${labelCls} ed:block ed:mb-1 ed:cursor-ew-resize ed:select-none`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {lbl}
      </label>
      <input
        aria-label={lbl}
        className={disabled ? `${inputCls} ed:font-mono ${disabledCls}` : `${inputCls} ed:font-mono`}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={f.text}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        onChange={(e) => {
          f.setText(e.target.value);
          const raw = e.target.value.trim();
          if (raw === '') return;
          const n = Number(raw);
          if (!Number.isNaN(n)) onCommit(n);
        }}
      />
    </div>
  );
}
