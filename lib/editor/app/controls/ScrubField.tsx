import { useRef } from 'react';
import { useLiveField } from './use-live-field';
import { scrubValue } from './scrub-value';
import { fieldCls, labelCls, inputCls, disabledCls } from './field-classes';

// Renders a text input (not `type="number"` — the spinner and locale-decimal
// behaviour are exactly what this control removes), plus a drag handle on the
// label. `inputMode="decimal"` keeps mobile keyboards numeric-friendly without
// reintroducing the native number input's quirks.
//
// jsdom doesn't implement `setPointerCapture`/`releasePointerCapture` (see
// `FrameOverlay.tsx` and `Waveform.tsx`, which hit the same wall). `drag.current`
// is set BEFORE the optional-called `setPointerCapture` so a throw there still
// leaves the gesture engaged instead of silently dropping it — and release is
// never called explicitly: the implicit release on pointerup/pointercancel is
// enough, and calling it (optionally or not) risks a throw that would skip
// clearing `drag.current`, stranding the field in drag mode so a later
// pointermove with no button held keeps committing values (same pattern as
// `Waveform.tsx`'s `onPointerUp`, which only clears its `dragging` ref).
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
    e.preventDefault();
    drag.current = { x0: e.clientX, v0: value };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    onCommit(scrubValue(d.v0, e.clientX - d.x0, step, { min, max, fine: e.shiftKey }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className={fieldCls} title={title}>
      <label
        className={
          disabled
            ? `${labelCls} ed:block ed:mb-1 ed:select-none ed:touch-none`
            : `${labelCls} ed:block ed:mb-1 ed:cursor-ew-resize ed:select-none ed:touch-none`
        }
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
