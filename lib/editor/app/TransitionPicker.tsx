import {
  TRANSITION_KINDS,
  DURATION_PRESETS,
  kindNeedsFrames,
  framesToSeconds,
  presetForFrames,
  subOptionsFor,
  defaultTransition,
  type Transition,
} from './transitions';
import styles from './TransitionPicker.module.css';

export interface TransitionPickerProps {
  /** The segment's current `transitionOut`. Undefined/omitted reads as a `cut`. */
  value?: Transition;
  fps: number;
  onChange: (t: Transition) => void;
}

/**
 * TransitionPicker — edits a segment's `transitionOut`.
 *
 * A gallery of the 8 transition kinds, plus (for every kind but `cut`) a
 * duration-preset row and whatever contextual sub-options that kind needs
 * (direction, from, color, softness — see `subOptionsFor`). Fully controlled:
 * every interaction emits a complete, valid `Transition` object via
 * `onChange`, and the component holds no state of its own.
 */
export function TransitionPicker({ value, fps, onChange }: TransitionPickerProps) {
  const current: Transition = value ?? { kind: 'cut' };
  const kind = current.kind;
  const needsFrames = kindNeedsFrames(kind);
  const frames = current.frames ?? 15;
  const activePreset = needsFrames ? presetForFrames(frames) : null;
  const subOptions = subOptionsFor(kind);

  const handleKindClick = (nextKind: string) => {
    onChange(defaultTransition(nextKind, { frames: current.frames }));
  };

  const handlePresetClick = (presetFrames: number) => {
    onChange({ ...current, frames: presetFrames });
  };

  const handleSubOptionChange = (prop: string, nextValue: string | number) => {
    onChange({ ...current, [prop]: nextValue });
  };

  return (
    <div className={styles.picker}>
      <div className={styles.sectionLabel}>Transition</div>
      <div className={styles.kindGrid}>
        {TRANSITION_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            className={k.kind === kind ? `${styles.kindButton} ${styles.kindButtonActive}` : styles.kindButton}
            aria-pressed={k.kind === kind}
            onClick={() => handleKindClick(k.kind)}
          >
            {k.label}
          </button>
        ))}
      </div>

      {needsFrames && (
        <div className={styles.presetRow}>
          {DURATION_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={
                preset.key === activePreset
                  ? `${styles.presetButton} ${styles.presetButtonActive}`
                  : styles.presetButton
              }
              aria-pressed={preset.key === activePreset}
              onClick={() => handlePresetClick(preset.frames)}
            >
              {preset.label}
            </button>
          ))}
          <span className={styles.readout}>
            {frames} frames · {framesToSeconds(frames, fps).toFixed(1)}s
          </span>
        </div>
      )}

      {subOptions.map((opt) => {
        if (opt.kind === 'enum') {
          const currentValue = current[opt.prop];
          return (
            <div className={styles.field} key={opt.prop}>
              <span className={styles.label}>{opt.label}</span>
              <div className={styles.enumRow}>
                {opt.options?.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={
                      choice.value === currentValue
                        ? `${styles.enumButton} ${styles.enumButtonActive}`
                        : styles.enumButton
                    }
                    aria-pressed={choice.value === currentValue}
                    onClick={() => handleSubOptionChange(opt.prop, choice.value)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        // Number sub-option (softness): fall back to that kind's default when
        // the incoming value doesn't set it (it's optional in the schema).
        const fallback = defaultTransition(kind)[opt.prop];
        const rawValue = current[opt.prop];
        const numberValue = typeof rawValue === 'number' ? rawValue : (fallback as number);
        return (
          <div className={styles.field} key={opt.prop}>
            <span className={styles.label}>{opt.label}</span>
            <div className={styles.numberRow}>
              <input
                type="range"
                className={styles.slider}
                min={0}
                max={100}
                value={numberValue}
                onChange={(e) => handleSubOptionChange(opt.prop, Number(e.target.value))}
              />
              <span className={styles.numberValue}>{numberValue}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
