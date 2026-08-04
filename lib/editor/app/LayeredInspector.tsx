import { useState, type ReactNode } from 'react';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { withTotalDuration } from '@video-toolkit/lib/reel-config-base/total-duration';
import { AccentEditor } from './AccentEditor';
import { Collapsible } from './Collapsible';
import {
  CUT_KIND,
  defaultTransition,
  kindNeedsFrames,
  transitionKindChoices,
  transitionKindLabel,
  transitionParamsFor,
  transitionFieldValue,
  withTransitionField,
  type DraftTransition,
} from './transitions';
import { parseActionId, type LaneId } from '../src/timeline/layered-adapter';
import type { AccentSlot } from '../../theming/palette';
import { PLACEMENTS } from '../../theming/placement';
import { effectCatalog, effectDefinition, humanizeKey, paramChoices, type EditorMeta, type ParamField } from './editor-meta';
import { LinkIcon, SkipBackIcon, UnlinkIcon, XIcon } from './icons';
import { warnOnce } from '../../render/warn-once';
import { videoUrl } from './LayeredTimeline';
import { framesForReel } from '../host/host-duration';
import { formatTimecode } from './controls/timecode';
import { aspectLabel, failedSources } from './project-summary';
import { handleRoomFrames, maxTransitionFrames, type HandleRoom } from '@video-toolkit/lib/reel-config-base/handle-room';
import { transitionAlignmentOf } from '@video-toolkit/lib/reel-config-base/transition-schema';
import { useLiveField } from './controls/use-live-field';
import { fieldCls, labelCls, inputCls, rowCls, readonlyValueCls, sectionCls } from './controls/field-classes';
import { ScrubField } from './controls/ScrubField';
import { SliderField } from './controls/SliderField';
import { TimecodeField } from './controls/TimecodeField';
import { SegmentedField } from './controls/SegmentedField';

// Routes the selected timeline item (by lane) to its editable properties,
// reusing the existing content editors. Edits produce a new LayeredReel via
// `onChange`. The single-track Inspector is replaced by this per-lane router.

export interface LayeredInspectorProps {
  reel: LayeredReel;
  selectedId: string | null; // action id `${lane}:${itemId}`
  onChange: (next: LayeredReel) => void;
  onSeek: (frame: number) => void;
  fps: number;
  /** Brand accent palette for the text AccentEditor. */
  accentSlots?: readonly AccentSlot[];
  /** Brand-supplied editor vocabulary (effect catalog, per-kind `props` fields,
   *  lane labels/colours). Optional — core defaults are brand-neutral. */
  meta?: EditorMeta;
  /** Decoded intrinsic duration (ms) per video URL — the SAME map
   *  `LayeredTimeline`'s `useSourceDurations` produces, threaded in here the
   *  same way `reel`/`fps` are so the transition length field can bound itself
   *  against the SAME handle-room math the timeline hatches with. Optional and
   *  defaults to `{}` (unknown durations, i.e. no bound) — every existing
   *  caller that doesn't know about this keeps its old, unbounded behaviour.
   *  Doubles as the failed-source diagnostic on the no-selection screen (a
   *  source resolving to `0` — see `project-summary.ts`'s `failedSources`). */
  sourceDurations?: Record<string, number>;
  /** The composition's pixel dimensions, shown on the no-selection ("project
   *  overview") screen. Optional (defaults to 0×0, which reads as `—` via
   *  `aspectLabel`) so every existing caller that doesn't know about this
   *  keeps working. */
  width?: number;
  height?: number;
}

const panelCls = 'ed:p-3 ed:w-full ed:h-full ed:overflow-y-auto ed:box-border';
const headingCls = 'ed:text-xs ed:text-ink ed:mb-2.5 ed:font-semibold';
// A one-line reason printed under a control that has gone inert, so a disabled
// field explains itself instead of reading as a bug. Deliberately quiet — it is
// an answer to "why can't I type here", not a warning — but it is the ONLY
// explanation of why the control is inert, so it's a value the user reads,
// not a label about one: `ink-2`, never `ink-3` (same rule as `readonlyValueCls`).
const noteCls = 'ed:text-[11px] ed:text-ink-2 ed:-mt-1 ed:mb-2';
// Shared "input chrome" for the plain buttons below (seek/link/add-effect),
// deliberately without `cursor`, `width`, `padding` or margin utilities — each
// call site's enabled/disabled state needs its own `cursor-*`, and its own
// sizing, so folding those in here would risk two utilities for the same
// property landing on one element (the same hazard `labelCls` avoids above).
const btnCls = 'ed:box-border ed:bg-control ed:text-ink ed:border ed:border-line ed:rounded ed:text-xs';

const Row = ({ children }: { children: ReactNode }) => <div className={rowCls}>{children}</div>;

function TextField({ lbl, value, onCommit }: { lbl: string; value: string | undefined; onCommit: (s: string) => void }) {
  const f = useLiveField(value ?? '');
  return (
    <div className={fieldCls}>
      <label className={`${labelCls} ed:block ed:mb-1`}>{lbl}</label>
      <input
        aria-label={lbl}
        className={inputCls}
        type="text"
        value={f.text}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        onChange={(e) => {
          f.setText(e.target.value);
          onCommit(e.target.value);
        }}
      />
    </div>
  );
}

function SelectField({
  lbl,
  value,
  options,
  onChange,
  optionLabel,
}: {
  lbl: string;
  value: string | undefined;
  options: string[];
  onChange: (s: string) => void;
  optionLabel?: (v: string) => string;
}) {
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className={fieldCls}>
      <label className={`${labelCls} ed:block ed:mb-1`}>{lbl}</label>
      <select aria-label={lbl} className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {value === undefined && <option value="">—</option>}
        {opts.map((o) => (
          <option key={o} value={o}>
            {optionLabel ? optionLabel(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}
// Boolean control for on/off sub-options (a checkbox, not a two-value select —
// a flag reads as a flag). `value` may be undefined for an optional field that
// has never been set; that renders as unchecked and commits `true` on click.
function CheckboxField({ lbl, value, onChange }: { lbl: string; value: boolean | undefined; onChange: (b: boolean) => void }) {
  return (
    <div className={fieldCls}>
      <label className={`${labelCls} ed:flex ed:items-center ed:gap-1.5 ed:cursor-pointer`}>
        {/* `accent-color` recolours the CHECKED fill/tick to the brand accent
            instead of the UA default blue — it has no effect on the
            unchecked state's background. */}
        <input
          type="checkbox"
          className="ed:accent-accent"
          checked={value ?? false}
          onChange={(e) => onChange(e.target.checked)}
        />
        {lbl}
      </label>
    </div>
  );
}

// A literal colour: the text input stays authoritative (it is the only control
// that can hold `''`, a CSS name, or a value a native picker would silently
// round), with a native swatch beside it for picking. The text input keeps
// `aria-label={lbl}` so a colour field is queried exactly like any other; the
// swatch is labelled separately.
function ColorField({ lbl, value, onCommit }: { lbl: string; value: string | undefined; onCommit: (s: string) => void }) {
  const f = useLiveField(value ?? '');
  const swatch = /^#[0-9a-fA-F]{6}$/.test(f.text) ? f.text : '#000000';
  return (
    <div className={fieldCls}>
      <label className={`${labelCls} ed:block ed:mb-1`}>{lbl}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          aria-label={`${lbl} swatch`}
          type="color"
          value={swatch}
          onChange={(e) => {
            f.setText(e.target.value);
            onCommit(e.target.value);
          }}
          // Border colour and background come from the same tokens the text
          // input beside it uses (`ed:border-line ed:bg-control`) so the pair
          // matches; the inline style below sets border WIDTH/STYLE only —
          // never colour — so it can't out-rank those two utilities.
          className="ed:border-line ed:bg-control"
          style={{ width: 28, height: 26, padding: 0, borderWidth: 1, borderStyle: 'solid', borderRadius: 4, flex: '0 0 auto' }}
        />
        <input
          aria-label={lbl}
          className={inputCls}
          type="text"
          value={f.text}
          onFocus={f.onFocus}
          onBlur={f.onBlur}
          onChange={(e) => {
            f.setText(e.target.value);
            onCommit(e.target.value);
          }}
        />
      </div>
    </div>
  );
}

// A colour that is EITHER a brand accent-slot key OR a literal (hex) —
// `type: 'accent-or-color'`, the dual widening `fade-to-color.color` and
// `wipe.color` both took (see `ACCENT_OR_COLOR_FIELDS`,
// transition-schema.ts). STATELESS by construction — mode is derived from
// `value` alone, never from a local toggle — so it round-trips correctly no
// matter how the underlying data got there (hand-edited literal, an older
// editor, a fresh pick) and never carries stale UI state across a different
// selected node that happens to share the field name.
//
// NEVER RETURNS NULL, unlike pure `accent`: even with no brand palette in
// scope there is still a usable control (the literal half needs none), so a
// dual field must not vanish the way `renderParamControl`'s plain `accent`
// branch does — that would be the same class of editor data-loss this repo
// has hit three times already (the inspector's kind coercion, `sepia: 1`
// dropped, the deprecated `from` alias).
const ACCENT_OR_COLOR_LITERAL_OPTION = '__literal__';

function AccentOrColorField({
  lbl,
  value,
  slots,
  onCommit,
}: {
  lbl: string;
  value: string | undefined;
  slots: readonly AccentSlot[];
  onCommit: (v: unknown) => void;
}): ReactNode {
  // No brand palette at all: nothing to pick a SLOT from, so the field is
  // simply its literal half. Never `null` — see the comment above.
  if (slots.length === 0) return <ColorField key={lbl} lbl={lbl} value={value} onCommit={onCommit} />;

  // MODE, deliberately NOT `isColorLiteral` (the render-time predicate
  // `resolveAccentOrColor` resolves with). That one requires a COMPLETE
  // 3/4/6/8-digit hex, which is correct for RESOLUTION but wrong for this
  // MOUNT decision: against a real (stateful) parent, the first keystroke of
  // a hex commits `'#'`, `isColorLiteral('#')` is false, and the control
  // would flip back to accent mode and UNMOUNT ITSELF — discarding whatever
  // was being typed, mid-edit, and removing the very control that could
  // repair it. That was caught by review as the fourth instance of this
  // repo's recurring editor data-loss bug (the kind coercion, `sepia: 1`
  // dropped, the deprecated `from` alias) — see the stateful-parent
  // character-by-character tests in LayeredInspector.test.tsx.
  //
  // A `#`-prefixed string is unambiguously an ATTEMPT at a literal regardless
  // of completeness — an accent-slot key is brand-chosen free text and never
  // starts with `#` (the same assumption `isColorLiteral` itself makes for
  // resolution) — so mode is decided by the prefix alone and never flips
  // mid-edit. An explicit EMPTY STRING is the third case: what "Custom
  // colour" seeds (below) before anything is typed, which must not be
  // indistinguishable from "nothing authored" (`undefined`, which stays in
  // accent mode) or the picker would snap straight back the moment it
  // re-renders.
  const literalMode = value !== undefined && (value === '' || value.startsWith('#'));
  // A KNOWN slot key selects itself; an unrecognised non-literal string
  // (a stale/renamed slot, or nothing authored yet) is handed to SelectField
  // as-is — its own unknown-value handling prepends it rather than losing it,
  // so a retired slot's key still shows as itself instead of silently
  // resetting to the first option.
  const selectValue = literalMode ? ACCENT_OR_COLOR_LITERAL_OPTION : value;
  return (
    <>
      <SelectField
        lbl={lbl}
        value={selectValue}
        options={[...slots.map((s) => s.key), ACCENT_OR_COLOR_LITERAL_OPTION]}
        optionLabel={(v) => (v === ACCENT_OR_COLOR_LITERAL_OPTION ? 'Custom colour (hex)' : slots.find((s) => s.key === v)?.label ?? v)}
        onChange={(next) => {
          // Choosing "custom" with no literal authored yet needs SOME value to
          // seed the colour control with, so its mode switches on this render
          // rather than needing a second interaction; an already-literal value
          // re-commits itself unchanged rather than resetting the seed.
          if (next === ACCENT_OR_COLOR_LITERAL_OPTION) onCommit(literalMode ? value : '');
          else onCommit(next);
        }}
      />
      {literalMode && <ColorField key={`${lbl}-literal`} lbl={`${lbl} (hex)`} value={value} onCommit={onCommit} />}
    </>
  );
}

// ---- THE parameter control -------------------------------------------------
// ONE dispatch from a `ParamField` to a control, for BOTH extension axes.
//
// There used to be two, and they disagreed. The declared-params path (opaque
// `props` / effect bags) understood `number | string | boolean` plus a bare
// `string[]` dropdown but had no `accent`; the transition path understood
// `enum | number | boolean | accent` but had no `string`, which is why burn's
// `mask` and `glowColor` had no control on either. Collapsing them means a
// brand's own registered kind gets the same vocabulary core's kinds get —
// including, now, text, colour, percent and angle.
//
// `accentSlots` is the BRAND's palette, and it is the only possible source for
// an `accent` field's choices: core's schema names the field but not its values
// (see `AccentKey` in transition-schema.ts). With no palette in scope there is
// nothing to choose from, so the control is omitted rather than shown empty.
//
// `numberStep` is the fallback step for a field that declares none — a UI
// affordance of the surrounding context (effect params are tuned in hundredths,
// transition sub-options in whole units), not a property of the parameter.
//
// Called as a plain FUNCTION, not rendered as `<ParamControl/>`: it must be
// able to answer "this parameter gets no control at all" as a `null` the caller
// can count, and a component that returns null internally is indistinguishable
// from one that renders — which is what `ParamFields`' "No editable params."
// fallback and the transition path's omit-an-accent-with-no-palette rule both
// need to see. It uses no hooks of its own; the controls it returns own theirs.
function renderParamControl({
  field,
  value,
  onCommit,
  accentSlots,
  numberStep = 1,
  declared = true,
  axis,
  kind,
}: {
  field: ParamField;
  value: unknown;
  onCommit: (v: unknown) => void;
  accentSlots?: readonly AccentSlot[];
  numberStep?: number;
  /** Review round 1, CRITICAL 2 — `false` for a SYNTHESIZED single-field
   *  descriptor (`ParamFields`'s "every remaining undeclared key" fallback,
   *  `{ prop: p }` with no `type`/`options` by construction), as opposed to a
   *  genuine registration/schema declaration. Warning 4 below must fire only
   *  for the latter: a rest field has no `type`/`options` BY DESIGN (that is
   *  the whole point of the fallback — "a host that supplies no metadata
   *  still reaches every value"), and the hazard the warning names ("writes a
   *  string into what might be a numeric field") cannot occur on that path —
   *  a rest field's value is read off `typeof value`, which is accurate
   *  because the value already exists. Defaults to `true` so the two
   *  genuinely-declared call sites (below, and `TransitionFields`) need no
   *  change; the ONE rest-field call site passes `false` explicitly. */
  declared?: boolean;
  /** Naming for warning 4's key/message (review round 1, IMPORTANT 2) — which
   *  AXIS ('overlay' | 'video' | 'effect' | 'transition') and which KIND/TYPE
   *  this field's registration belongs to, so two different registrations
   *  that happen to declare the same `prop` are distinguishable in both the
   *  de-duplication key and the message. Only meaningful when `declared`. */
  axis?: string;
  kind?: string;
}): ReactNode {
  const lbl = field.label ?? humanizeKey(field.prop);
  const asString = typeof value === 'string' ? value : undefined;

  if (field.type === 'accent') {
    const slots = accentSlots ?? [];
    if (!slots.length) return null;
    return (
      <SelectField
        key={field.prop}
        lbl={lbl}
        value={asString}
        options={slots.map((s) => s.key)}
        optionLabel={(v) => slots.find((s) => s.key === v)?.label ?? v}
        onChange={onCommit}
      />
    );
  }

  // The DUAL form — accent-slot key OR a literal (hex). A SEPARATE branch
  // from `accent` above (see `AccentOrColorField`'s own doc comment): unlike
  // `accent`, this never returns null for lack of a palette.
  if (field.type === 'accent-or-color') {
    return (
      <AccentOrColorField key={field.prop} lbl={lbl} value={asString} slots={accentSlots ?? []} onCommit={onCommit} />
    );
  }

  // `options` before `type`: a declaration that carries both has always been
  // read as a dropdown, and an `enum` without options is unrenderable as
  // anything else anyway.
  if (field.options || field.type === 'enum') {
    const choices = paramChoices(field.options) ?? [];
    const optionLabel = (v: string) => choices.find((c) => c.value === v)?.label ?? v;
    // A short enum reads better as a segmented control than a dropdown; past
    // four choices a row of buttons stops scanning faster than a select does.
    return choices.length > 0 && choices.length <= 4 ? (
      <SegmentedField
        key={field.prop}
        lbl={lbl}
        value={asString}
        options={choices.map((c) => c.value)}
        optionLabel={optionLabel}
        onChange={onCommit}
      />
    ) : (
      <SelectField
        key={field.prop}
        lbl={lbl}
        value={asString}
        options={choices.map((c) => c.value)}
        optionLabel={optionLabel}
        onChange={onCommit}
      />
    );
  }

  // A DECLARED type wins over the value's own — it is the only thing that can
  // type a field whose key the item does not carry yet. Without it an absent
  // numeric prop falls through to TextField and commits a string ("0.5") into
  // the bag; the renderer coerces, but the saved config goes type-dirty.
  //
  // Task 6.3, warning 4 — a GENUINELY DECLARED `ParamField` (a registration's
  // own `params`, or a transition's schema-derived sub-option — never the
  // synthesized `{ prop }` rest-field fallback, which has no `type`/`options`
  // BY DESIGN and is excluded via `declared` above — review round 1, CRITICAL
  // 2) that declares NEITHER `type` NOR `options` falls all the way through
  // to this value-presence fallback, which is exactly the "writes a string
  // into what might be a numeric field" hazard the comment above names. Core
  // itself never produces such a field (every core-derived descriptor sets
  // `type` — see `subOptionForField`); this can only be a brand's own
  // hand-declared `ParamField` literal.
  if (declared && field.type === undefined && !field.options) {
    const where = axis && kind ? `${axis} "${kind}"` : axis ? `a ${axis} registration` : 'a registration';
    warnOnce(`param-field-untyped:${axis ?? '?'}:${kind ?? '?'}:${field.prop}`, () =>
      `[video-toolkit] ParamField "${field.prop}" on ${where} declares neither \`type\` nor \`options\`, so its ` +
      'control is chosen from whatever value happens to be present right now (or a plain text box, if none ' +
      `is). Declare \`type\` on "${field.prop}" so its control (and the value it commits) does not depend on ` +
      'what the field currently holds. (Warning only; nothing is blocked, and this is reported once per field ' +
      'per registration.)');
  }
  const t = field.type ?? typeof value;

  if (t === 'number' || t === 'percent' || t === 'angle') {
    // `percent` and `angle` change the CONTROL, never the stored value: no
    // ×100, no wrap. A percent is offered as a bounded 0–100 field and an angle
    // in whole degrees, and an explicit min/max/step on the field still wins.
    const preset: { min?: number; max?: number; step?: number } =
      t === 'percent' ? { min: 0, max: 100, step: 1 } : t === 'angle' ? { step: 1 } : {};
    const min = field.min ?? preset.min;
    const max = field.max ?? preset.max;
    const step = field.step ?? preset.step ?? numberStep;
    const v = typeof value === 'number' ? value : undefined;
    // A declaration with BOTH bounds gets a slider; anything else gets a scrub,
    // which needs no range. Zero core catalog fields declare min/max today, so
    // the scrub path is the one that actually runs — that is why it is the
    // foundation rather than an extra.
    return min !== undefined && max !== undefined ? (
      <SliderField
        key={field.prop}
        lbl={lbl}
        min={min}
        max={max}
        step={step}
        value={v}
        // What an unset value shows: `field.default` when the registration
        // declared one (its documented "value the schema falls back to when
        // the field is absent" — param-field.ts) — the closest thing to a
        // real renderer default this GENERIC path can know, since the actual
        // component reading this bag is brand code core never sees. No core
        // registration declares `default` today, so this floors to `min` in
        // practice; that is a documented, visible floor, not a claim that
        // `min` IS the renderer's default — the honest answer available when
        // the true default is unknowable from here.
        fallback={typeof field.default === 'number' ? field.default : min}
        onCommit={onCommit}
      />
    ) : (
      <ScrubField key={field.prop} lbl={lbl} step={step} min={min} max={max} value={v} onCommit={onCommit} />
    );
  }
  if (t === 'boolean')
    return <CheckboxField key={field.prop} lbl={lbl} value={typeof value === 'boolean' ? value : undefined} onChange={onCommit} />;
  if (t === 'color') return <ColorField key={field.prop} lbl={lbl} value={asString} onCommit={onCommit} />;
  if (t === 'string' || value === undefined || value === null)
    return <TextField key={field.prop} lbl={lbl} value={asString ?? ''} onCommit={onCommit} />;
  return null; // nested object/array — not editable as a single field
}

// ---- Generic bag editor ----------------------------------------------------
// The schema keeps a video item's `props` and an effect's params as opaque
// records on purpose (core knows the mechanism, the brand owns the vocabulary).
// This renders such a bag WITHOUT knowing any brand's field names:
//   • a field the brand DECLARED (EditorMeta) renders in declared order, as a
//     dropdown when it declares `options`, and shows even when the item does
//     not carry the key yet (so a brand's outro Style is offerable from empty);
//   • every remaining key renders typed by the value it currently holds.
// Result: a host that supplies no metadata still reaches every value.
function ParamFields({
  values,
  fields,
  onPatch,
  accentSlots,
  axis,
  kind,
}: {
  values: Record<string, unknown>;
  fields?: readonly ParamField[];
  onPatch: (patch: Record<string, unknown>) => void;
  accentSlots?: readonly AccentSlot[];
  /** Naming for warning 4 (review round 1, IMPORTANT 2) — threaded straight
   *  through to `renderParamControl` for every DECLARED field below. Not
   *  used for rest fields, which never trip that warning at all. */
  axis?: string;
  kind?: string;
}) {
  const declared = fields ?? [];
  const declaredProps = new Set(declared.map((f) => f.prop));
  const rest = Object.keys(values).filter((k) => !declaredProps.has(k));

  const renderOne = (f: ParamField, isDeclared: boolean) =>
    renderParamControl({
      field: f,
      value: values[f.prop],
      onCommit: (v) => onPatch({ [f.prop]: v }),
      accentSlots,
      numberStep: 0.1,
      declared: isDeclared,
      axis,
      kind,
    });

  // `declared: true` for a real registration entry, `declared: false` for a
  // synthesized rest-field descriptor (review round 1, CRITICAL 2 — a rest
  // field has no `type`/`options` BY DESIGN and must never trip warning 4).
  const nodes = [
    ...declared.map((f) => renderOne(f, true)),
    ...rest.map((p) => renderOne({ prop: p }, false)),
  ].filter(Boolean);
  if (!nodes.length) return <div className="ed:text-[11px] ed:text-ink-2" style={{ padding: '3px 0' }}>No editable params.</div>;
  return <>{nodes}</>;
}

// Shared transition editor — kind + whatever contextual params that kind needs
// (`transitionParamsFor`: core's structural fields for a core kind, the
// registration's declared `params` for a brand's own) + a length field gated by
// kindNeedsFrames. Used both by the video-lane "Transition out" section and
// the transitions-lane route (which targets transitionIn or transitionOut
// depending on `edge`), so the two never diverge again.
// `t` is a DraftTransition, not the strict `Transition` union: the picker
// writes one field at a time, so mid-edit the object is legitimately not yet
// a valid member (a kind just switched to `slide` has no `direction` for an
// instant). TransitionSchema is what judges the settled result.
//
// `accentSlots` is the BRAND's palette, and it is what fills an `accent`
// sub-option's dropdown — core's schema names the field but not its values
// (see AccentKey in transition-schema.ts), so the choices can only come from
// here.
// Exported for test: the kind switch has to throw away a kind's LOOK params
// (they belong to the old kind) while keeping its TIMING (which does not), and
// nothing else in the inspector is asked to tell those two apart. Mounting it
// directly is the only way to pin that without driving the whole inspector.
export function TransitionFields({
  t,
  onChange,
  accentSlots,
  meta,
  maxFrames,
}: {
  t: DraftTransition;
  onChange: (next: DraftTransition) => void;
  accentSlots?: readonly AccentSlot[];
  /** The brand's editor vocabulary. Only `transitionProps` is read here: it is
   *  what makes a brand-registered kind selectable and gives it controls. */
  meta?: EditorMeta;
  /** Ceiling on `frames`, in frames — the most this boundary's neighbours can
   *  actually lend at `t`'s alignment (`maxTransitionFrames`/`handleRoomFrames`
   *  in `handle-room.ts`). Undefined when the caller has no boundary context
   *  (mounted directly, as this component's own tests do, or `transitionIn`'s
   *  opening fade, which has no left neighbour to starve) — the field is then
   *  unbounded, exactly as it always was.
   *
   *  BOUNDS NEW INPUT ONLY. A boundary starved retroactively (its neighbour
   *  trimmed after this length was authored) keeps its authored value here —
   *  the timeline's hatching and `boundaryDiagnostics` report it instead. This
   *  component must never clamp on mount; only `onCommit` below clamps, and
   *  only what the user just typed. */
  maxFrames?: number;
}) {
  const kind = t.kind ?? CUT_KIND;
  // Catalog ∪ the brand's registered kinds — see `transitionKindChoices`. The
  // picker used to run off the catalog alone, which is why a brand kind
  // could render (Task 1.2) and still not be choosable.
  const choices = transitionKindChoices(meta?.transitionProps);
  return (
    <>
      <SelectField
        lbl="Kind"
        value={kind}
        options={choices.map((k) => k.kind)}
        optionLabel={(k) => transitionKindLabel(k, meta?.transitionProps)}
        // `frames` AND `alignment` are threaded through: both are kind-independent
        // timing, and `defaultTransition` builds a fresh object that the caller
        // then writes over the old one wholesale, so anything not named here is
        // silently lost. The kind's own look params SHOULD be lost — they
        // belonged to the old kind — which is exactly why this list is explicit.
        onChange={(nextKind) =>
          onChange(defaultTransition(nextKind, { frames: t.frames, alignment: t.alignment, enabled: t.enabled }))
        }
      />
      {/* One control per declared parameter, through the SAME dispatch the
          opaque-bag editor uses (`renderParamControl`). Until Task 1.1 this was
          a second, hand-written switch over a second vocabulary — which is how
          burn's `mask`/`glowColor` ended up with no control on either path. */}
      {transitionParamsFor(kind, meta?.transitionProps).map((opt) =>
        renderParamControl({
          field: opt,
          // ALIAS-AWARE (Task 2.5). A renamed field's old spelling still parses
          // and still renders, so the control must show what the reel actually
          // draws — and committing writes the canonical name and drops the old
          // one, rather than leaving two fields that can disagree.
          value: transitionFieldValue(t, opt.prop),
          onCommit: (v) => onChange(withTransitionField(t, opt.prop, v)),
          accentSlots,
          declared: true,
          axis: 'transition',
          kind,
        }),
      )}
      {kindNeedsFrames(kind) && (() => {
        // Infinity is "no neighbour bound at all" (an edge boundary, or every
        // duration involved is still unknown) — the same thing an absent
        // `maxFrames` means, so both read as the plain, unbounded label.
        const bounded = maxFrames !== undefined && Number.isFinite(maxFrames);
        return (
          <ScrubField
            lbl={bounded ? `Length (frames, max ${maxFrames})` : 'Length (frames)'}
            value={t.frames}
            min={1}
            max={bounded ? maxFrames : undefined}
            onCommit={(n) => onChange({ ...t, frames: Math.min(bounded ? (maxFrames as number) : Infinity, Math.max(1, Math.round(n))) })}
          />
        );
      })()}
    </>
  );
}

/** Grade fields whose NEUTRAL value is 0, not 1. The inspector drops neutral
 *  fields so `grade` stays minimal; getting this set wrong is silent DATA LOSS
 *  — before Phase 4 Task 2.7 the rule was inlined as `k === 'temperature' || k
 *  === 'tint'`, so adding `sepia`/`hueRotateDeg` to Grade would have made an
 *  authored `sepia: 1` (fully sepia) vanish the moment any grade control was
 *  touched. One named set, so a future Grade field is a one-line decision. */
const GRADE_NEUTRAL_ZERO: ReadonlySet<string> = new Set(['temperature', 'tint', 'sepia', 'hueRotateDeg']);

const BLEND_DIRECTIONS = ['tl-br', 'tr-bl', 'bl-tr', 'br-tl'];
// The position dropdown offers exactly the canonical placement vocabulary —
// deriving it (instead of a hand-copied list) is what keeps the dropdown, the
// Placement type, and the geometry map from drifting apart again. A legacy
// persisted value outside the list (e.g. `center-left`) still displays via
// SelectField's unknown-value prepend and renders via PLACEMENT_ALIASES.
const OVERLAY_POSITIONS: string[] = [...PLACEMENTS];

// The seven Grade fields, edited by ONE place now: the item-level
// `item.grade` Color panel below. A `type: 'grade'` EFFECT used to exist as a
// second, redundant way to author the exact same seven parameters (Phase 4
// Task 3.4 through its removal) — the two were one implementation at render
// time (style-effect.ts's `gradeStyleEffect`) but two places to edit in the
// UI, with a whole guard mechanism just to keep them from fighting over one
// render. `item.grade` is the survivor; this component (and the `disabled`
// guard that used to grey it) no longer needs a second caller to serve.
function GradeFields({
  g,
  onPatch,
}: {
  g: { brightness?: number; contrast?: number; saturation?: number; temperature?: number; tint?: number; sepia?: number; hueRotateDeg?: number };
  onPatch: (patch: Record<string, number>) => void;
}) {
  return (
    <>
      <Row>
        <SliderField lbl="Brightness" min={0.2} max={2} step={0.05} value={g.brightness ?? 1} fallback={1} onCommit={(n) => onPatch({ brightness: n })} />
        <SliderField lbl="Contrast" min={0.2} max={2} step={0.05} value={g.contrast ?? 1} fallback={1} onCommit={(n) => onPatch({ contrast: n })} />
      </Row>
      <Row>
        <SliderField lbl="Saturation" min={0} max={2} step={0.05} value={g.saturation ?? 1} fallback={1} onCommit={(n) => onPatch({ saturation: n })} />
        <SliderField lbl="Temperature" min={-1} max={1} step={0.05} value={g.temperature ?? 0} fallback={0} onCommit={(n) => onPatch({ temperature: n })} />
      </Row>
      <Row>
        <SliderField lbl="Tint" min={-1} max={1} step={0.05} value={g.tint ?? 0} fallback={0} onCommit={(n) => onPatch({ tint: n })} />
        <SliderField lbl="Sepia" min={0} max={1} step={0.05} value={g.sepia ?? 0} fallback={0} onCommit={(n) => onPatch({ sepia: n })} />
      </Row>
      <SliderField lbl="Hue rotate (deg)" min={-180} max={180} step={1} value={g.hueRotateDeg ?? 0} fallback={0} onCommit={(n) => onPatch({ hueRotateDeg: n })} />
    </>
  );
}

// Editable params (BODY only — the collapsible header + remove ✕ are supplied by
// the caller's <Collapsible>) for one effect. Core has a bespoke editor for
// ken-burns (rendered by SegmentMedia; it has two legitimate shapes) and
// blend (emitted by core's own derivation) — and renders every other effect
// through ParamFields: brand-declared fields when the catalog declares them,
// else typed by the values the effect currently holds. A hand-authored
// `type: 'grade'` effect entry (the catalog no longer offers ADDING one via
// this UI — see CORE_EFFECTS's comment in editor-meta.ts) falls through to
// that same generic ParamFields path rather than a bespoke one now — that's
// only about editing an already-authored literal here in the inspector.
// It does NOT mean the renderer is vestigial: `gradeStyleEffect`
// (lib/theming/effects/style-effect.ts) is load-bearing and runs for EVERY
// graded clip, reached via `item.grade` (see `syntheticGradeEffect`), not
// only for this hand-authored fallback case.
function EffectEditor({
  eff,
  fields,
  onPatch,
  accentSlots,
  focalX,
}: {
  eff: Record<string, unknown>;
  fields?: readonly ParamField[];
  onPatch: (patch: Record<string, unknown>) => void;
  accentSlots?: readonly AccentSlot[];
  /** The owning video item's own focal point X — needed ONLY so the ken-burns
   *  From X/To X sliders can show the SAME fallback the renderer actually
   *  uses when a from/to endpoint is omitted (`kb.fromX ?? (focalX ?? 0.5)`,
   *  ken-burns.ts) rather than a fixed constant that's wrong whenever the
   *  item has its own focal point set. No `focalY` counterpart — From/To Y
   *  have no slider control today (only From/To scale, via ScrubField, which
   *  needs no fallback since it has no renderer-side "unset means something
   *  else" behaviour to mirror). */
  focalX?: number;
}) {
  const type = eff.type as string;
  const num = (k: string) => (typeof eff[k] === 'number' ? (eff[k] as number) : undefined);
  if (type === 'ken-burns') {
    // Ken Burns has TWO shapes (both render, see SegmentMedia): the `direction`
    // shorthand (in/left/up) and explicit from/to pan+zoom.
    // Show the control that matches what's actually set — a direction-based
    // effect edited with the from/to fields looked like an empty/phantom effect.
    const hasFromTo = ['fromX', 'toX', 'fromScale', 'toScale'].some((k) => typeof eff[k] === 'number');
    if (typeof eff.direction === 'string' || !hasFromTo) {
      return (
        <SegmentedField
          lbl="Direction"
          value={(eff.direction as string | undefined) ?? 'in'}
          options={['in', 'left', 'up']}
          onChange={(s) => onPatch({ direction: s })}
        />
      );
    }
    return (
      <>
        {/* The renderer's own fallback when an endpoint is omitted is the
            item's OWN focal point, not a fixed constant — `kb.fromX ?? (focalX
            ?? 0.5)` (ken-burns.ts:71,73). Mirrored here exactly so the slider
            never shows a value the render wouldn't actually produce. */}
        <Row>
          <SliderField lbl="From X" min={0} max={1} step={0.01} value={num('fromX')} fallback={focalX ?? 0.5} onCommit={(n) => onPatch({ fromX: n })} />
          <SliderField lbl="To X" min={0} max={1} step={0.01} value={num('toX')} fallback={focalX ?? 0.5} onCommit={(n) => onPatch({ toX: n })} />
        </Row>
        <Row>
          <ScrubField lbl="From scale" min={0.5} step={0.05} value={num('fromScale')} onCommit={(n) => onPatch({ fromScale: n })} />
          <ScrubField lbl="To scale" min={0.5} step={0.05} value={num('toScale')} onCommit={(n) => onPatch({ toScale: n })} />
        </Row>
      </>
    );
  }
  if (type === 'blend') {
    return (
      <>
        <TextField lbl="To source" value={eff.to as string | undefined} onCommit={(s) => onPatch({ to: s || undefined })} />
        <SelectField lbl="Direction" value={eff.direction as string | undefined} options={BLEND_DIRECTIONS} onChange={(s) => onPatch({ direction: s })} />
        {/* `blend`'s RENDERER is brand-owned (a registration this repo never
            sees — e.g. PP's), not core's, so unlike ken-burns there is no
            formula here to mirror for what an unset startPct/endPct
            actually plays as. `min`/`max` are the only honest fallback
            available from core; a brand adding its own inspector for this
            effect can supply the real one. */}
        <Row>
          <SliderField lbl="Start %" min={0} max={100} step={1} value={num('startPct')} fallback={0} onCommit={(n) => onPatch({ startPct: n })} />
          <SliderField lbl="End %" min={0} max={100} step={1} value={num('endPct')} fallback={100} onCommit={(n) => onPatch({ endPct: n })} />
        </Row>
      </>
    );
  }
  const { type: _t, ...params } = eff;
  return <ParamFields values={params} fields={fields} onPatch={onPatch} accentSlots={accentSlots} axis="effect" kind={type} />;
}

// `btnCls` plus this call site's own sizing and margin. Neither `seekBtnCls`
// nor `linkBtnCls` has a disabled variant anywhere it's used any more
// (`AddEffectControl`'s used to be one — the grade/`blockedTypes` guard it
// existed for is gone, see that component's own comment) — same hazard
// `btnCls` itself is written to avoid, `linkBtnCls` carries no `cursor-*` of
// its own; every consumer adds its own.
const seekBtnCls = `${btnCls} ed:inline-flex ed:items-center ed:gap-1.5 ed:cursor-pointer ed:mb-2.5 ed:w-auto ed:px-2.5 ed:py-1`;
const linkBtnCls = `${btnCls} ed:inline-flex ed:items-center ed:gap-1.5 ed:mt-1 ed:w-full ed:px-2.5 ed:py-1.5 ed:text-left`;

// The addable effects: core's own catalog plus whatever the brand declared.
// Core ships only what core RENDERS (ken-burns via SegmentMedia) — every
// other effect is a brand's and arrives through EditorMeta.effects.
//
// This control used to also take a `blockedTypes` set (Phase 4 Task 3.4
// through this removal) — a guard against authoring both `item.grade` and a
// `type: 'grade'` effect on top of it, which would have applied grade with
// `item.grade` winning the render-time dedup silently. That guard is gone
// along with the effect it protected against: `grade` no longer has a
// catalog entry at all (see CORE_EFFECTS's comment in editor-meta.ts), so
// there is nothing left in "+ Add effect" that could collide with
// `item.grade` in the first place.
function AddEffectControl({
  meta,
  onAdd,
}: {
  meta?: EditorMeta;
  onAdd: (effect: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const catalog = effectCatalog(meta);
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${btnCls} ed:cursor-pointer ed:mb-1 ed:w-auto ed:px-2.5 ed:py-1`}
      >
        + Add effect
      </button>
      {open &&
        catalog.map((e) => (
          <button
            key={e.type}
            type="button"
            onClick={() => {
              onAdd({ type: e.type, ...(e.defaults ?? {}) });
              setOpen(false);
            }}
            className={`${linkBtnCls} ed:cursor-pointer`}
          >
            {e.label ?? e.type}
          </button>
        ))}
    </div>
  );
}

export function LayeredInspector({ reel, selectedId, onChange, onSeek, fps, accentSlots, meta, sourceDurations, width = 0, height = 0 }: LayeredInspectorProps) {
  // The dedicated `accentSlots` prop is the ONE source for the palette —
  // EditorMeta deliberately does not carry a copy (see editor-meta.ts).
  const slots = accentSlots;
  const durationsMs = sourceDurations ?? {};
  // The room a video item at index `i` can lend — the SAME per-item reading
  // `boundaryDiagnostics` (LayeredTimeline.tsx) uses, so the length field's
  // ceiling and the timeline's hatching can never disagree about a boundary.
  const roomOf = (i: number): HandleRoom | undefined => {
    const it = reel.tracks.video[i];
    if (!it) return undefined;
    const url = videoUrl(it);
    return handleRoomFrames(it, url ? durationsMs[url] : undefined, fps);
  };
  const patchItem = (lane: LaneId, id: string, patch: Record<string, unknown>) => {
    const key = lane as keyof LayeredReel['tracks'];
    const arr = reel.tracks[key] as Array<{ id: string }>;
    const next = arr.map((it) => (it.id === id ? { ...it, ...patch } : it));
    onChange({ ...reel, tracks: { ...reel.tracks, [lane]: next } });
  };

  if (!selectedId) {
    // Every source the reel actually references — video items that carry one
    // (clip/broll/photo; multi-clip/card/outro don't) plus every audio bed.
    // Music is deliberately excluded here (it gets its own row below).
    const sources = Array.from(new Set([
      ...reel.tracks.video.map((v) => (v as { source?: string }).source).filter(Boolean) as string[],
      ...reel.tracks.audio.map((a) => a.source),
    ]));
    const failed = failedSources(sources, durationsMs);

    return (
      <div className={panelCls}>
        <h3 className={headingCls}>Reel</h3>

        <div className={sectionCls}>Format</div>
        <Row>
          <div className={fieldCls}><label className={`${labelCls} ed:block ed:mb-1`}>Resolution</label><div className={readonlyValueCls}>{width} × {height}</div></div>
          <div className={fieldCls}><label className={`${labelCls} ed:block ed:mb-1`}>Aspect</label><div className={readonlyValueCls}>{aspectLabel(width, height)}</div></div>
        </Row>
        <Row>
          <div className={fieldCls}><label className={`${labelCls} ed:block ed:mb-1`}>Frame rate</label><div className={readonlyValueCls}>{fps} fps</div></div>
          <div className={fieldCls}><label className={`${labelCls} ed:block ed:mb-1`}>Frames</label><div className={readonlyValueCls}>{framesForReel(reel, fps)}</div></div>
        </Row>

        <div className={sectionCls}>Content</div>
        {/* All read-only — plain text, not field-styled boxes (they aren't editable). */}
        <div className={fieldCls}>
          <label className={`${labelCls} ed:block ed:mb-1`}>Topic</label>
          <div className={readonlyValueCls}>{reel.meta.topic}</div>
        </div>
        <div className={fieldCls}>
          <label className={`${labelCls} ed:block ed:mb-1`}>Duration</label>
          <div className={readonlyValueCls}>{formatTimecode(reel.meta.totalDurationMs, fps)}</div>
        </div>
        <div className={fieldCls}>
          <label className={`${labelCls} ed:block ed:mb-1`}>Media sources</label>
          <div className={readonlyValueCls}>{sources.length}</div>
        </div>
        <div className={fieldCls}>
          <label className={`${labelCls} ed:block ed:mb-1`}>Music</label>
          <div className={readonlyValueCls}>{reel.tracks.music.source ?? '(none)'} · base {reel.tracks.music.baseVolumeDb}dB</div>
        </div>

        {/* Omitted entirely when healthy — a project with nothing wrong shows
            no diagnostic, matching the header diagnostics badge's behaviour. */}
        {failed.length > 0 && (
          <div className={fieldCls}>
            <label className={`${labelCls} ed:block ed:mb-1`}>Failed to load</label>
            <div className="ed:text-xs ed:text-warn ed:font-mono">{failed.join(', ')}</div>
          </div>
        )}

        {/* A value the user reads, not a label about it — ink-2, per
            field-classes.ts:20-21 (ink-3 at 12px is below WCAG AA). */}
        <div className="ed:text-[11px] ed:text-ink-2 ed:mt-2">
          {reel.tracks.video.length} video · {reel.tracks.overlays.length} overlays · {reel.tracks.audio.length} audio · {reel.tracks.brand.length} brand
        </div>
        {/* A hint, not a value — ink-3 is correct here. */}
        <div className="ed:text-[11px] ed:text-ink-3 ed:mt-2.5">Select a timeline item to edit it.</div>
      </div>
    );
  }

  const { lane, id, edge } = parseActionId(selectedId);

  if (lane === 'transitions') {
    // The `transitions` lane is a derived "at-the-cut"/"at-the-edge" view
    // (see layered-adapter.ts): the marker's itemId is always a video item,
    // and every write here mutates only that item's transitionOut (edge
    // 'out', the common case — every non-cut transitionOut incl. the last
    // item's closing fade) or transitionIn (edge 'in' — the first item's
    // opening fade) — no repositioning of clips or the marker itself.
    const v = reel.tracks.video.find((x) => x.id === id);
    if (!v) return null;
    const edgeField = edge === 'in' ? 'transitionIn' : 'transitionOut';
    const t = (v[edgeField] ?? { kind: CUT_KIND }) as DraftTransition;
    const kind = t.kind ?? CUT_KIND;
    // Only `transitionOut` is a boundary the handle-room model reasons about
    // (the cut between this item and the next); `transitionIn`'s opening fade
    // has no left neighbour to starve, so it stays unbounded. The LAST item's
    // `transitionOut` is exempted the same way: it is the reel's closing fade,
    // not a boundary — `video-track-layout.ts` zeroes its outHalf regardless
    // of this item's own tail room (there is no neighbour to extend into), so
    // `roomOf(idx + 1)` (the reel edge, `undefined`) is the wrong thing to
    // bound against and `roomOf(idx)`'s OWN tail (the item's leftover after
    // its trim) is irrelevant here too. Without this, a final clip trimmed to
    // its file end (tail === 0) clamped a legitimate authored length down to
    // 1 (Important 5 of the 2026-08-03 review).
    const idx = reel.tracks.video.findIndex((x) => x.id === id);
    const isLast = idx === reel.tracks.video.length - 1;
    const maxFrames =
      edge === 'in' || isLast ? undefined : Math.max(1, maxTransitionFrames(roomOf(idx), roomOf(idx + 1), transitionAlignmentOf(t)));
    return (
      <div className={panelCls}>
        <h3 className={headingCls}>
          Transition {edge === 'in' ? 'in' : 'out'} · {transitionKindLabel(kind, meta?.transitionProps)}
        </h3>
        <TransitionFields t={t} accentSlots={slots} meta={meta} maxFrames={maxFrames} onChange={(next) => patchItem('video', id, { [edgeField]: next })} />
      </div>
    );
  }

  if (lane === 'video') {
    const v = reel.tracks.video.find((x) => x.id === id);
    if (!v) return null;
    return (
      <div className={panelCls}>
        <h3 className={headingCls}>Clip · {v.kind}</h3>
        <button type="button" className={seekBtnCls} onClick={() => onSeek(Math.round((v.startMs / 1000) * fps))}>
          <SkipBackIcon size={13} /> seek to start
        </button>
        {(v.kind === 'clip' || v.kind === 'broll') && (
          <>
            <TextField lbl="Source" value={v.source} onCommit={(s) => s.trim() && patchItem('video', id, { source: s })} />
            <Row>
              <TimecodeField lbl="Trim in" ms={v.sourceInMs} fps={fps} onCommit={(ms) => patchItem('video', id, { sourceInMs: ms })} />
              <TimecodeField lbl="Trim out" ms={v.sourceOutMs} fps={fps} onCommit={(ms) => patchItem('video', id, { sourceOutMs: ms })} />
            </Row>
            {/* Framing — how this shot meets the frame. `Fit` comes FIRST
                because it decides what the controls under it mean: under
                blur-pad the whole shot is visible, so there is no crop to
                focus and the crop controls go inert (greyed, value kept, with
                a reason printed below). */}
            {(() => {
              const isBlurPad = (v as { fit?: string }).fit === 'blur-pad';
              const backdrop = v as { backdropBlur?: number; backdropDim?: number };
              return (
                <>
                  <SegmentedField
                    lbl="Fit"
                    value={isBlurPad ? 'blur-pad' : 'cover'}
                    options={['cover', 'blur-pad']}
                    optionLabel={(o) => (o === 'blur-pad' ? 'Whole shot + blurred backdrop' : 'Fill frame')}
                    // `cover` clears the field rather than writing it: the
                    // schema leaves `fit` optional precisely so an untouched
                    // item doesn't grow a `fit: 'cover'` key on every
                    // round-trip through the editor.
                    onChange={(s) => patchItem('video', id, { fit: s === 'blur-pad' ? 'blur-pad' : undefined })}
                  />
                  <Row>
                    <ScrubField
                      lbl="Zoom (1 = none)"
                      min={1}
                      step={0.05}
                      // Round the display — width is stored as 1/zoom, so the round-trip
                      // otherwise shows e.g. 3.0003 instead of 3.
                      value={Math.round((1 / ((v.crop as { width?: number } | undefined)?.width ?? 1)) * 100) / 100}
                      onCommit={(z) =>
                        patchItem('video', id, {
                          crop: z > 1 ? { ...((v.crop as object) ?? {}), width: 1 / z } : undefined,
                        })
                      }
                    />
                    <SliderField
                      lbl="Crop focus X"
                      min={0}
                      max={1}
                      step={0.01}
                      value={v.focalX}
                      // Matches cropCoverStyle's own fallback (crop.ts) — an
                      // unset focal point renders centred, not hard-left.
                      fallback={0.5}
                      disabled={isBlurPad}
                      onCommit={(n) => patchItem('video', id, { focalX: n })}
                    />
                    <SliderField
                      lbl="Crop focus Y"
                      min={0}
                      max={1}
                      step={0.01}
                      value={v.focalY}
                      fallback={0.5}
                      disabled={isBlurPad}
                      onCommit={(n) => patchItem('video', id, { focalY: n })}
                    />
                  </Row>
                  {isBlurPad && <p className={noteCls}>Nothing is cropped — the whole shot is visible.</p>}
                  <Row>
                    <SliderField
                      lbl="Backdrop blur"
                      min={0}
                      max={80}
                      step={1}
                      // Shows the value the RENDERER will use, not an empty box
                      // — the defaults live in two places by necessity (schema
                      // and render), and a blank field would suggest "none".
                      value={backdrop.backdropBlur ?? 32}
                      fallback={32}
                      disabled={!isBlurPad}
                      onCommit={(n) => patchItem('video', id, { backdropBlur: n })}
                    />
                    <SliderField
                      lbl="Backdrop dim"
                      min={0}
                      max={1}
                      step={0.05}
                      value={backdrop.backdropDim ?? 0.45}
                      fallback={0.45}
                      disabled={!isBlurPad}
                      onCommit={(n) => patchItem('video', id, { backdropDim: n })}
                    />
                  </Row>
                </>
              );
            })()}
          </>
        )}
        {/* Per-clip colour grade (brightness/contrast/saturation/sepia/hue
            rotation are native CSS filters; temperature/tint drive an SVG
            white-balance matrix). Applies to the SegmentMedia-rendered footage
            kinds. Neutral = 1 for the multipliers, 0 for GRADE_NEUTRAL_ZERO;
            neutral values are dropped so `grade` stays minimal.

            This panel is always enabled now. It used to grey itself
            (`disabled`, Phase 4 Task 3.4's SECOND editor guard) whenever the
            item also carried an authored `type: 'grade'` EFFECT, since the
            two were one implementation at render time and the effect would
            silently win the dedup — but that effect no longer exists as
            something the UI can add (removed from CORE_EFFECTS; see
            editor-meta.ts), so the collision this guard protected against
            cannot occur through authoring any more and the guard went with
            it. A hand-edited config could still carry a stray `type: 'grade'`
            effect entry from before this change; render-time backwards
            compatibility for that is unaffected (`item.grade` still wins the
            dedup — see style-effect.ts), only this panel's own greying is
            gone. */}
        {(v.kind === 'clip' || v.kind === 'broll' || v.kind === 'photo') && (() => {
          const g = (v.grade ?? {}) as {
            brightness?: number; contrast?: number; saturation?: number;
            temperature?: number; tint?: number; sepia?: number; hueRotateDeg?: number;
          };
          const patchGrade = (patch: Record<string, number>) => {
            const merged = { ...g, ...patch } as Record<string, number>;
            const cleaned = Object.fromEntries(
              Object.entries(merged).filter(([k, val]) => typeof val === 'number' && val !== (GRADE_NEUTRAL_ZERO.has(k) ? 0 : 1)),
            );
            patchItem('video', id, { grade: Object.keys(cleaned).length ? cleaned : undefined });
          };
          return (
            <>
              <div className={sectionCls}>Color</div>
              <GradeFields g={g} onPatch={patchGrade} />
            </>
          );
        })()}
        {/* The item's opaque brand render-hint bag (`props` — e.g. an outro's
            style/variant). Core renders it generically; a brand turns a field
            into a dropdown by declaring it in meta.videoProps[kind].
            The into-outro transition lives on the PREVIOUS clip's transitionOut
            (at-cut) — edit it via that clip's transition, not here. */}
        {(() => {
          const props = (v.props ?? {}) as Record<string, unknown>;
          const declared = meta?.videoProps?.[v.kind];
          if (!declared?.length && !Object.keys(props).length) return null;
          return (
            <>
              <div className={sectionCls}>{humanizeKey(v.kind)}</div>
              <ParamFields
                values={props}
                fields={declared}
                onPatch={(patch) => patchItem('video', id, { props: { ...props, ...patch } })}
                accentSlots={accentSlots}
                axis="video"
                kind={v.kind}
              />
            </>
          );
        })()}
        {/* Renderer default: music-envelope.ts's `item?.musicBoostDb ?? 0` —
            an unboosted segment plays the music bed at its plain base volume,
            not silenced. */}
        <SliderField lbl="Music boost (dB)" min={-60} max={12} step={0.5} value={v.musicBoostDb} fallback={0} onCommit={(n) => patchItem('video', id, { musicBoostDb: n })} />
        {/* Effects only apply to footage renderers (SegmentMedia + brand wrappers).
            outro/card render bespoke and ignore item.effects, so don't offer them. */}
        {(v.kind === 'clip' || v.kind === 'broll' || v.kind === 'photo' || v.kind === 'multi-clip') && (
          <>
        {v.effects &&
          v.effects.map((eff, i) => {
            const type = (eff as { type?: string }).type ?? 'effect';
            return (
              <Collapsible
                key={i}
                title={`Effect · ${type}`}
                right={
                  <button
                    type="button"
                    aria-label={`remove effect ${type}`}
                    onClick={() => patchItem('video', id, { effects: v.effects!.filter((_, j) => j !== i) })}
                    style={{ background: 'none', border: 'none', color: '#9a9da5', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                  >
                    <XIcon size={13} />
                  </button>
                }
              >
                <EffectEditor
                  eff={eff as Record<string, unknown>}
                  fields={effectDefinition(meta, type)?.params}
                  accentSlots={accentSlots}
                  focalX={v.focalX}
                  onPatch={(patch) =>
                    patchItem('video', id, { effects: v.effects!.map((e, j) => (j === i ? { ...(e as Record<string, unknown>), ...patch } : e)) })
                  }
                />
              </Collapsible>
            );
          })}
        <AddEffectControl
          meta={meta}
          onAdd={(effect) => patchItem('video', id, { effects: [...(v.effects ?? []), effect] })}
        />
          </>
        )}
        {(() => {
          // ANY authored kind is shown as ITSELF. This used to test the kind
          // against TRANSITION_CATALOG and fall back to `{kind:'cut'}` — which,
          // once a brand could register its own kinds (Task 1.2), meant a
          // perfectly renderable brand transition was displayed as "Cut" and
          // then WRITTEN BACK as one the moment any control in this section was
          // touched. Same class as the dropped `alignment` (1.4) and `enabled`
          // (1.5): whatever the editor has no control for must at least survive
          // it untouched. Only a genuinely absent or kind-less value is a cut.
          const raw = v.transitionOut as { kind?: string } | undefined;
          const t: DraftTransition = raw?.kind ? (raw as DraftTransition) : { kind: CUT_KIND };
          const idx = reel.tracks.video.findIndex((x) => x.id === id);
          // Same exemption as the `transitions`-lane view above: the LAST
          // item's transitionOut is the reel's closing fade, not a boundary —
          // see the comment there for why bounding it against
          // roomOf(idx + 1)/roomOf(idx) is wrong (Important 5).
          const isLast = idx === reel.tracks.video.length - 1;
          const maxFrames = isLast ? undefined : Math.max(1, maxTransitionFrames(roomOf(idx), roomOf(idx + 1), transitionAlignmentOf(t)));
          return (
            <>
              <div className={sectionCls}>Transition out</div>
              <TransitionFields t={t} accentSlots={slots} meta={meta} maxFrames={maxFrames} onChange={(next) => patchItem('video', id, { transitionOut: next })} />
            </>
          );
        })()}
      </div>
    );
  }

  if (lane === 'overlays') {
    const o = reel.tracks.overlays.find((x) => x.id === id);
    if (!o) return null;
    const content = o.content as { kind?: string; text?: string; lines?: string[]; reveal?: string; fontSize?: number };
    const patchContent = (patch: Record<string, unknown>) => patchItem('overlays', id, { content: { ...o.content, ...patch } });
    return (
      <div className={panelCls}>
        <h3 className={headingCls}>Overlay · {content.kind ?? 'overlay'}</h3>
        <button type="button" className={seekBtnCls} onClick={() => onSeek(Math.round((o.startMs / 1000) * fps))}>
          <SkipBackIcon size={13} /> seek to start
        </button>
        {content.text !== undefined && (
          <div className={fieldCls}>
            <label className={`${labelCls} ed:block ed:mb-1`}>Text</label>
            {/* Multi-line WYSIWYG accent editor — an overlay's text can span
                several lines (e.g. a stacked pull-quote look). */}
            <AccentEditor value={content.text ?? ''} onChange={(next) => patchContent({ text: next })} colors={slots} multiline />
          </div>
        )}
        {/* The overlay's `content` bag, edited by TWO layers that ADD UP rather
            than replace each other:
              • core's own typed controls for the three content fields core
                KNOWS — reveal/hide (real enums at render, see
                OverlayRenderProps) and fontSize (steps in 4s) — shown, as they
                always have been, whenever the item carries any of them;
              • the kind's registration `params` (meta.overlayProps, derived
                from the theme by editorMetaFromTheme) on top, so a brand's own
                overlay kind is editable with no core UI knowing it.

            Additive, NOT per-kind either/or. Declaring one param of a brand's
            own must not drag reveal/hide/fontSize into the generic bag editor,
            where they would be typed by value: reveal and hide would become
            free-text inputs and `content` is `z.record(z.unknown())`, so
            nothing would reject `reveal: "lien"` — the exact type-dirty write
            declared fields exist to prevent.

            A brand that declares one of the three BY NAME takes it over — core
            steps aside for that field only and it renders below through the
            brand's own declaration (options/type), which is the same
            explicit-wins rule editorMetaFromTheme applies.

            `text` is excluded from the declared params: it has the dedicated
            accent-aware editor above, and a plain TextField for the same value
            would be a second, accent-blind editor for it. */}
        {(() => {
          const declared = (meta?.overlayProps?.[content.kind ?? ''] ?? []).filter((f) => f.prop !== 'text');
          const declaredProps = new Set(declared.map((f) => f.prop));
          const bag = o.content as Record<string, unknown>;
          const core = (['reveal', 'hide', 'fontSize'] as const).filter((k) => !declaredProps.has(k));
          const showCore = core.some((k) => bag[k] !== undefined);
          // Keys core renders above are dropped so ParamFields cannot show a
          // second, value-typed control for the same field.
          const { kind: _k, text: _t, ...values } = bag;
          for (const k of core) delete values[k];
          return (
            <>
              {showCore && (
                <>
                  {(core.includes('reveal') || core.includes('hide')) && (
                    <Row>
                      {core.includes('reveal') && (
                        <SelectField lbl="Reveal" value={content.reveal ?? 'line'} options={['line', 'all', 'none']} onChange={(s) => patchContent({ reveal: s })} />
                      )}
                      {core.includes('hide') && (
                        <SelectField lbl="Hide" value={content.hide ?? 'fade'} options={['fade', 'none']} onChange={(s) => patchContent({ hide: s })} />
                      )}
                    </Row>
                  )}
                  {core.includes('fontSize') && (
                    <ScrubField lbl="Font size" min={8} step={1} value={content.fontSize} onCommit={(n) => patchContent({ fontSize: Math.round(n) })} />
                  )}
                </>
              )}
              {/* Undeclared leftovers surface only once something IS declared —
                  a kind with no declaration keeps exactly today's inspector. */}
              {declared.length > 0 && (
                <ParamFields values={values} fields={declared} onPatch={patchContent} accentSlots={accentSlots} axis="overlay" kind={content.kind} />
              )}
            </>
          );
        })()}
        {o.position !== undefined && (
          <SelectField lbl="Position" value={o.position} options={OVERLAY_POSITIONS} onChange={(s) => patchItem('overlays', id, { position: s })} />
        )}
        <Row>
          <TimecodeField lbl="Start" ms={o.startMs} fps={fps} onCommit={(ms) => patchItem('overlays', id, { startMs: ms })} />
          <TimecodeField lbl="End" ms={o.endMs} fps={fps} onCommit={(ms) => patchItem('overlays', id, { endMs: ms })} />
        </Row>
      </div>
    );
  }

  if (lane === 'audio') {
    const a = reel.tracks.audio.find((x) => x.id === id);
    if (!a) return null;
    return (
      <div className={panelCls}>
        <h3 className={headingCls}>Audio</h3>
        <TextField lbl="Source" value={a.source} onCommit={(s) => s.trim() && patchItem('audio', id, { source: s })} />
        <Row>
          <TimecodeField lbl="Trim in" ms={a.sourceInMs} fps={fps} disabled={!!a.followsVideoId} title={a.followsVideoId ? 'Linked to a clip — unlink to trim independently' : undefined} onCommit={(ms) => patchItem('audio', id, { sourceInMs: ms })} />
          <TimecodeField
            lbl="Trim out"
            ms={a.sourceOutMs ?? a.sourceInMs + (a.endMs - a.startMs)}
            fps={fps}
            disabled={!!a.followsVideoId}
            title={a.followsVideoId ? 'Linked to a clip — unlink to trim independently' : undefined}
            onCommit={(ms) => patchItem('audio', id, { sourceOutMs: ms })}
          />
        </Row>
        <Row>
          {/* Renderer default: audio-gain.ts's `item.volumeDb ?? 0` — an
              audio bed authored without explicit gain plays at unity, not
              muted. This is THE regression this prop exists to fix: shown
              as `min` (−60dB) before, a live bed looked fully silenced. */}
          <SliderField lbl="Volume (dB)" min={-60} max={12} step={0.5} value={a.volumeDb} fallback={0} onCommit={(n) => patchItem('audio', id, { volumeDb: n })} />
        </Row>
        <Row>
          <TimecodeField lbl="Fade in" ms={a.fadeInMs ?? 0} fps={fps} onCommit={(ms) => patchItem('audio', id, { fadeInMs: ms > 0 ? ms : undefined })} />
          <TimecodeField lbl="Fade out" ms={a.fadeOutMs ?? 0} fps={fps} onCommit={(ms) => patchItem('audio', id, { fadeOutMs: ms > 0 ? ms : undefined })} />
        </Row>
        {/* Linked audio: bound beds follow their clip through every edit; unlink
            to edit this bed independently. Re-link binds it to the clip under it. */}
        {a.followsVideoId ? (
          <button
            type="button"
            className={`${linkBtnCls} ed:cursor-pointer`}
            title={`This bed moves and trims with clip ${a.followsVideoId}. Unlink to edit it on its own.`}
            onClick={() => patchItem('audio', id, { followsVideoId: undefined })}
          >
            <LinkIcon size={13} /> Linked to {a.followsVideoId} · Unlink
          </button>
        ) : (
          <button
            type="button"
            className={`${linkBtnCls} ed:cursor-pointer`}
            title="Bind this bed to its clip and snap it exactly onto the clip's span."
            onClick={() => {
              // Prefer the clip this bed was named after (seg-002-audio → seg-002),
              // else the clip under its start. On re-link, SNAP the bed exactly onto
              // the clip: same start/end, trim shifted by the position deltas so the
              // audio content rides along.
              const named = reel.tracks.video.find((x) => x.id === id.replace(/-audio$/, ''));
              const v = named ?? reel.tracks.video.find((x) => x.startMs <= a.startMs && a.startMs < x.endMs);
              if (!v) return;
              const curOut = a.sourceOutMs ?? a.sourceInMs + (a.endMs - a.startMs);
              patchItem('audio', id, {
                followsVideoId: v.id,
                startMs: v.startMs,
                endMs: v.endMs,
                sourceInMs: Math.max(0, a.sourceInMs + (v.startMs - a.startMs)),
                sourceOutMs: curOut + (v.endMs - a.endMs),
              });
            }}
          >
            <UnlinkIcon size={13} /> Independent · Link to clip
          </button>
        )}
      </div>
    );
  }

  if (lane === 'music') {
    const m = reel.tracks.music;
    // Music edits can change the reel's total length (its end counts like any
    // other track end), so recompute it on every patch.
    const patchMusic = (patch: Record<string, unknown>) =>
      onChange(withTotalDuration({ ...reel, tracks: { ...reel.tracks, music: { ...m, ...patch } } }));
    return (
      <div className={panelCls}>
        <h3 className={headingCls}>Music</h3>
        <TextField lbl="Source" value={m.source} onCommit={(s) => patchMusic({ source: s.trim() || undefined })} />
        {/* `baseVolumeDb` carries a zod `.default(-8)` (layered-schema.ts), so
            `value` is never actually undefined here — `fallback` is stated
            anyway, matching that same schema default, per this component's
            "state it explicitly" contract rather than leaning on the schema
            to keep it unreachable. */}
        <SliderField lbl="Base volume (dB)" min={-60} max={12} step={0.5} value={m.baseVolumeDb} fallback={-8} onCommit={(n) => patchMusic({ baseVolumeDb: n })} />
        <TimecodeField
          lbl="End"
          ms={m.endMs ?? reel.meta.totalDurationMs}
          fps={fps}
          onCommit={(ms) => patchMusic({ endMs: ms > 0 ? ms : undefined })}
        />
        <Row>
          <TimecodeField lbl="Fade in" ms={m.fadeInMs ?? 0} fps={fps} onCommit={(ms) => patchMusic({ fadeInMs: ms > 0 ? ms : undefined })} />
          <TimecodeField lbl="Fade out" ms={m.fadeOutMs ?? 1000} fps={fps} onCommit={(ms) => patchMusic({ fadeOutMs: ms })} />
        </Row>
        {/* Same rationale as `noteCls`: the only explanation of how the Music
            lane's drawn envelope relates to these fields, not a section
            label — `ink-2`, not `ink-3`. Its own class (not `noteCls`) since
            its margin (`mt-2`, not `noteCls`'s `-mt-1 mb-2`) differs. */}
        <div className="ed:text-[11px] ed:text-ink-2 ed:mt-2">
          The effective envelope (base + each clip’s music boost + fades) is drawn on the Music lane. Set End to 0 to follow the
          content end again; Fade out 0 = hard cut. The reel is always as long as its furthest-reaching track.
        </div>
      </div>
    );
  }

  // brand
  const b = reel.tracks.brand.find((x) => x.id === id);
  if (!b) return null;
  return (
    <div className={panelCls}>
      <h3 className={headingCls}>Brand · {b.kind}</h3>
      <Row>
        <TimecodeField lbl="Start" ms={b.startMs} fps={fps} onCommit={(ms) => patchItem('brand', id, { startMs: ms })} />
        <TimecodeField lbl="End" ms={b.endMs} fps={fps} onCommit={(ms) => patchItem('brand', id, { endMs: ms })} />
      </Row>
    </div>
  );
}
