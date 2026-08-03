import { useLiveField } from './use-live-field';
import { parseTimecode, formatTimecode } from './timecode';
import { fieldCls, labelCls, inputCls, disabledCls } from './field-classes';

export function TimecodeField({
  lbl, ms, fps, onCommit, disabled, title,
}: {
  lbl: string; ms: number | undefined; fps: number;
  onCommit: (ms: number) => void; disabled?: boolean; title?: string;
}) {
  const f = useLiveField(ms === undefined ? '' : formatTimecode(ms, fps));
  const cls = `${inputCls} ed:font-mono ed:tabular-nums`;
  return (
    <div className={fieldCls} title={title}>
      <label className={`${labelCls} ed:block ed:mb-1`}>{lbl}</label>
      <input
        aria-label={lbl}
        className={disabled ? `${cls} ${disabledCls}` : cls}
        type="text"
        disabled={disabled}
        value={f.text}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        onChange={(e) => {
          f.setText(e.target.value);
          // null means "not readable yet" — leave the value alone rather than
          // zeroing a trim while the author is still typing.
          const parsed = parseTimecode(e.target.value, fps);
          if (parsed !== null) onCommit(parsed);
        }}
      />
    </div>
  );
}
