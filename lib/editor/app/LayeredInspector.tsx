import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { warnOnce } from '../../render/warn-once';

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
}

const label: React.CSSProperties = { fontSize: 11, color: '#7a7d85', display: 'block', marginBottom: 2 };
const field: React.CSSProperties = { marginBottom: 8, flex: 1, minWidth: 0 };
const input: React.CSSProperties = {
  width: '100%',
  background: '#1c1e22',
  color: '#e8e8ea',
  border: '1px solid #34363e',
  borderRadius: 4,
  padding: '5px 7px',
  fontSize: 12,
  boxSizing: 'border-box',
};
const heading: React.CSSProperties = { fontSize: 12, color: '#e8e8ea', margin: '0 0 10px', fontWeight: 600 };
const panel: React.CSSProperties = { padding: 12, width: '100%', height: '100%', overflowY: 'auto', boxSizing: 'border-box' };
const section: React.CSSProperties = { fontSize: 10, color: '#5f626a', textTransform: 'uppercase', letterSpacing: 0.4, margin: '10px 0 6px' };

const Row = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', gap: 8 }}>{children}</div>;

// Live-commit field state: controlled local text that commits on every valid
// keystroke (preview updates immediately, not on blur), and resyncs from the
// external `value` only while UNFOCUSED (external edit / undo / item switch) so
// typing never fights the caret and a no-op commit reverts cleanly on blur.
function useLiveField(external: string) {
  const [text, setText] = useState<string>(external);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(external);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external]);
  return {
    text,
    setText,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      setText(external);
    },
  };
}

function NumberField({ lbl, value, step = 1, min, max, onCommit, disabled, title }: { lbl: string; value: number | undefined; step?: number; min?: number; max?: number; onCommit: (n: number) => void; disabled?: boolean; title?: string }) {
  const f = useLiveField(value === undefined ? '' : String(value));
  return (
    <div style={field} title={title}>
      <label style={label}>{lbl}</label>
      <input
        aria-label={lbl}
        style={disabled ? { ...input, opacity: 0.45, cursor: 'not-allowed' } : input}
        type="number"
        step={step}
        min={min}
        max={max}
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

function TextField({ lbl, value, onCommit }: { lbl: string; value: string | undefined; onCommit: (s: string) => void }) {
  const f = useLiveField(value ?? '');
  return (
    <div style={field}>
      <label style={label}>{lbl}</label>
      <input
        aria-label={lbl}
        style={input}
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
    <div style={field}>
      <label style={label}>{lbl}</label>
      <select aria-label={lbl} style={input} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
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
    <div style={field}>
      <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, cursor: 'pointer' }}>
        <input type="checkbox" checked={value ?? false} onChange={(e) => onChange(e.target.checked)} />
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
    <div style={field}>
      <label style={label}>{lbl}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          aria-label={`${lbl} swatch`}
          type="color"
          value={swatch}
          onChange={(e) => {
            f.setText(e.target.value);
            onCommit(e.target.value);
          }}
          style={{ width: 28, height: 26, padding: 0, border: '1px solid #34363e', borderRadius: 4, background: '#1c1e22', flex: '0 0 auto' }}
        />
        <input
          aria-label={lbl}
          style={input}
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
    return (
      <SelectField
        key={field.prop}
        lbl={lbl}
        value={asString}
        options={choices.map((c) => c.value)}
        optionLabel={(v) => choices.find((c) => c.value === v)?.label ?? v}
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
    return (
      <NumberField
        key={field.prop}
        lbl={lbl}
        step={field.step ?? preset.step ?? numberStep}
        min={field.min ?? preset.min}
        max={field.max ?? preset.max}
        value={typeof value === 'number' ? value : undefined}
        onCommit={onCommit}
      />
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
  if (!nodes.length) return <div style={{ fontSize: 11, color: '#7a7d85', padding: '3px 0' }}>No editable params.</div>;
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
}: {
  t: DraftTransition;
  onChange: (next: DraftTransition) => void;
  accentSlots?: readonly AccentSlot[];
  /** The brand's editor vocabulary. Only `transitionProps` is read here: it is
   *  what makes a brand-registered kind selectable and gives it controls. */
  meta?: EditorMeta;
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
      {kindNeedsFrames(kind) && (
        <NumberField
          lbl="Length (frames)"
          value={t.frames}
          onCommit={(n) => onChange({ ...t, frames: Math.max(1, Math.round(n)) })}
        />
      )}
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

// The seven Grade fields, shared (Phase 4 Task 3.4) between the item-level
// `item.grade` Color panel below and a `type: 'grade'` effect's own body in
// EffectEditor — the two are ONE implementation now (style-effect.ts's
// `gradeStyleEffect`), so they get ONE control set rather than two hand-kept
// copies that could drift on a field addition. `disabled` (the second editor
// guard) greys every field without touching `g` — the caller still owns and
// passes back whatever value each field currently holds, so a disabled
// render never drops data, only interaction.
function GradeFields({
  g,
  onPatch,
  disabled,
}: {
  g: { brightness?: number; contrast?: number; saturation?: number; temperature?: number; tint?: number; sepia?: number; hueRotateDeg?: number };
  onPatch: (patch: Record<string, number>) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <Row>
        <NumberField lbl="Brightness" step={0.05} value={g.brightness ?? 1} disabled={disabled} onCommit={(n) => onPatch({ brightness: n })} />
        <NumberField lbl="Contrast" step={0.05} value={g.contrast ?? 1} disabled={disabled} onCommit={(n) => onPatch({ contrast: n })} />
      </Row>
      <Row>
        <NumberField lbl="Saturation" step={0.05} value={g.saturation ?? 1} disabled={disabled} onCommit={(n) => onPatch({ saturation: n })} />
        <NumberField lbl="Temperature" step={0.05} value={g.temperature ?? 0} disabled={disabled} onCommit={(n) => onPatch({ temperature: n })} />
      </Row>
      <Row>
        <NumberField lbl="Tint" step={0.05} value={g.tint ?? 0} disabled={disabled} onCommit={(n) => onPatch({ tint: n })} />
        <NumberField lbl="Sepia" step={0.05} value={g.sepia ?? 0} disabled={disabled} onCommit={(n) => onPatch({ sepia: n })} />
      </Row>
      <NumberField lbl="Hue rotate (deg)" step={1} value={g.hueRotateDeg ?? 0} disabled={disabled} onCommit={(n) => onPatch({ hueRotateDeg: n })} />
    </>
  );
}

// Editable params (BODY only — the collapsible header + remove ✕ are supplied by
// the caller's <Collapsible>) for one effect. Core has a bespoke editor for the
// three effects it OWNS — ken-burns and grade (both rendered by SegmentMedia;
// ken-burns has two legitimate shapes) and blend (emitted by core's own
// derivation) — and renders every other effect through ParamFields:
// brand-declared fields when the catalog declares them, else typed by the
// values the effect currently holds.
function EffectEditor({
  eff,
  fields,
  onPatch,
  accentSlots,
}: {
  eff: Record<string, unknown>;
  fields?: readonly ParamField[];
  onPatch: (patch: Record<string, unknown>) => void;
  accentSlots?: readonly AccentSlot[];
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
        <SelectField
          lbl="Direction"
          value={(eff.direction as string | undefined) ?? 'in'}
          options={['in', 'left', 'up']}
          onChange={(s) => onPatch({ direction: s })}
        />
      );
    }
    return (
      <>
        <Row>
          <NumberField lbl="From X" step={0.01} value={num('fromX')} onCommit={(n) => onPatch({ fromX: n })} />
          <NumberField lbl="To X" step={0.01} value={num('toX')} onCommit={(n) => onPatch({ toX: n })} />
        </Row>
        <Row>
          <NumberField lbl="From scale" step={0.05} value={num('fromScale')} onCommit={(n) => onPatch({ fromScale: n })} />
          <NumberField lbl="To scale" step={0.05} value={num('toScale')} onCommit={(n) => onPatch({ toScale: n })} />
        </Row>
      </>
    );
  }
  if (type === 'grade') {
    // Same seven fields, same shape as `item.grade` — see GradeFields above.
    // Never disabled here: THIS is the authored effect itself, not the
    // item-level shorthand the second editor guard greys when this exists.
    return <GradeFields g={eff as Record<string, number | undefined>} onPatch={onPatch} />;
  }
  if (type === 'blend') {
    return (
      <>
        <TextField lbl="To source" value={eff.to as string | undefined} onCommit={(s) => onPatch({ to: s || undefined })} />
        <SelectField lbl="Direction" value={eff.direction as string | undefined} options={BLEND_DIRECTIONS} onChange={(s) => onPatch({ direction: s })} />
        <Row>
          <NumberField lbl="Start %" value={num('startPct')} onCommit={(n) => onPatch({ startPct: n })} />
          <NumberField lbl="End %" value={num('endPct')} onCommit={(n) => onPatch({ endPct: n })} />
        </Row>
      </>
    );
  }
  const { type: _t, ...params } = eff;
  return <ParamFields values={params} fields={fields} onPatch={onPatch} accentSlots={accentSlots} axis="effect" kind={type} />;
}

const seekBtn: React.CSSProperties = { ...input, cursor: 'pointer', marginBottom: 10, width: 'auto', padding: '4px 10px' };
const linkBtn: React.CSSProperties = { ...input, cursor: 'pointer', marginTop: 4, width: '100%', padding: '6px 10px', textAlign: 'left', fontSize: 12 };
const readonlyValue: React.CSSProperties = { fontSize: 13, color: '#c8cbd2', padding: '3px 0' };

// The addable effects: core's own catalog plus whatever the brand declared.
// Core ships only what core RENDERS (ken-burns and grade via SegmentMedia) —
// every other effect is a brand's and arrives through EditorMeta.effects.
//
// `blockedTypes` (Phase 4 Task 3.4) is the FIRST editor guard against
// authoring both `item.grade` and a `type: 'grade'` effect — the two are now
// ONE implementation (style-effect.ts's `gradeStyleEffect`) and an item
// carrying both would apply grade with `item.grade` winning the render-time
// dedup silently, with no signal to the author that the effect they just
// added does nothing. Disabled AND guarded on click (belt and suspenders: a
// disabled DOM button already suppresses the click in a real browser, but
// nothing stops a future caller from removing `disabled` while missing the
// onClick guard, so both stay).
function AddEffectControl({
  meta,
  onAdd,
  blockedTypes,
}: {
  meta?: EditorMeta;
  onAdd: (effect: Record<string, unknown>) => void;
  blockedTypes?: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const catalog = effectCatalog(meta);
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ ...seekBtn, marginBottom: 4 }}>+ Add effect</button>
      {open &&
        catalog.map((e) => {
          const isBlocked = blockedTypes?.has(e.type) ?? false;
          return (
            <button
              key={e.type}
              type="button"
              disabled={isBlocked}
              title={isBlocked ? 'This item already has a grade — remove it first, or edit that grade directly.' : undefined}
              onClick={() => {
                if (isBlocked) return;
                onAdd({ type: e.type, ...(e.defaults ?? {}) });
                setOpen(false);
              }}
              style={isBlocked ? { ...linkBtn, opacity: 0.4, cursor: 'not-allowed' } : { ...linkBtn }}
            >
              {e.label ?? e.type}
            </button>
          );
        })}
    </div>
  );
}

export function LayeredInspector({ reel, selectedId, onChange, onSeek, fps, accentSlots, meta }: LayeredInspectorProps) {
  // The dedicated `accentSlots` prop is the ONE source for the palette —
  // EditorMeta deliberately does not carry a copy (see editor-meta.ts).
  const slots = accentSlots;
  const patchItem = (lane: LaneId, id: string, patch: Record<string, unknown>) => {
    const key = lane as keyof LayeredReel['tracks'];
    const arr = reel.tracks[key] as Array<{ id: string }>;
    const next = arr.map((it) => (it.id === id ? { ...it, ...patch } : it));
    onChange({ ...reel, tracks: { ...reel.tracks, [lane]: next } });
  };

  if (!selectedId) {
    return (
      <div style={panel}>
        <h3 style={heading}>Reel</h3>
        {/* All read-only — plain text, not field-styled boxes (they aren't editable). */}
        <div style={field}>
          <label style={label}>Topic</label>
          <div style={readonlyValue}>{reel.meta.topic}</div>
        </div>
        <div style={field}>
          <label style={label}>Total duration</label>
          <div style={readonlyValue}>{(reel.meta.totalDurationMs / 1000).toFixed(2)}s</div>
        </div>
        <div style={field}>
          <label style={label}>Music</label>
          <div style={readonlyValue}>{reel.tracks.music.source ?? '(none)'} · base {reel.tracks.music.baseVolumeDb}dB</div>
        </div>
        <div style={{ fontSize: 11, color: '#5f626a', marginTop: 8 }}>
          {reel.tracks.video.length} video · {reel.tracks.overlays.length} overlays · {reel.tracks.audio.length} audio · {reel.tracks.brand.length} brand
        </div>
        <div style={{ fontSize: 11, color: '#5f626a', marginTop: 10 }}>Select a timeline item to edit it.</div>
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
    return (
      <div style={panel}>
        <h3 style={heading}>
          Transition {edge === 'in' ? 'in' : 'out'} · {transitionKindLabel(kind, meta?.transitionProps)}
        </h3>
        <TransitionFields t={t} accentSlots={slots} meta={meta} onChange={(next) => patchItem('video', id, { [edgeField]: next })} />
      </div>
    );
  }

  if (lane === 'video') {
    const v = reel.tracks.video.find((x) => x.id === id);
    if (!v) return null;
    return (
      <div style={panel}>
        <h3 style={heading}>Clip · {v.kind}</h3>
        <button type="button" style={seekBtn} onClick={() => onSeek(Math.round((v.startMs / 1000) * fps))}>
          ⇥ seek to start
        </button>
        {(v.kind === 'clip' || v.kind === 'broll') && (
          <>
            <TextField lbl="Source" value={v.source} onCommit={(s) => s.trim() && patchItem('video', id, { source: s })} />
            <Row>
              <NumberField lbl="Trim in (s)" step={0.05} value={v.sourceInMs / 1000} onCommit={(n) => patchItem('video', id, { sourceInMs: Math.round(n * 1000) })} />
              <NumberField lbl="Trim out (s)" step={0.05} value={v.sourceOutMs / 1000} onCommit={(n) => patchItem('video', id, { sourceOutMs: Math.round(n * 1000) })} />
            </Row>
            <Row>
              <NumberField
                lbl="Zoom (1 = fit)"
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
              <NumberField lbl="Focal X" step={0.01} value={v.focalX} onCommit={(n) => patchItem('video', id, { focalX: n })} />
              <NumberField lbl="Focal Y" step={0.01} value={v.focalY} onCommit={(n) => patchItem('video', id, { focalY: n })} />
            </Row>
          </>
        )}
        {/* Per-clip colour grade (brightness/contrast/saturation/sepia/hue
            rotation are native CSS filters; temperature/tint drive an SVG
            white-balance matrix). Applies to the SegmentMedia-rendered footage
            kinds. Neutral = 1 for the multipliers, 0 for GRADE_NEUTRAL_ZERO;
            neutral values are dropped so `grade` stays minimal.

            SECOND editor guard (Phase 4 Task 3.4): greyed — `disabled`,
            NOT hidden and NOT cleared — whenever the item already carries an
            authored `type: 'grade'` effect. `item.grade` and that effect are
            ONE implementation post-3.4 (style-effect.ts's
            `gradeStyleEffect`), and `applyStyleEffects`'s dedup means
            `item.grade` always wins the render when both are present — so
            editing THIS panel while a grade effect exists would silently do
            nothing. Disabling it is the signal; `v.grade` itself is
            untouched by `hasGradeEffect` either way, so removing the grade
            effect later re-enables the SAME stored value, round-tripped. */}
        {(v.kind === 'clip' || v.kind === 'broll' || v.kind === 'photo') && (() => {
          const g = (v.grade ?? {}) as {
            brightness?: number; contrast?: number; saturation?: number;
            temperature?: number; tint?: number; sepia?: number; hueRotateDeg?: number;
          };
          const hasGradeEffect = (v.effects ?? []).some((e) => (e as { type?: string }).type === 'grade');
          const patchGrade = (patch: Record<string, number>) => {
            const merged = { ...g, ...patch } as Record<string, number>;
            const cleaned = Object.fromEntries(
              Object.entries(merged).filter(([k, val]) => typeof val === 'number' && val !== (GRADE_NEUTRAL_ZERO.has(k) ? 0 : 1)),
            );
            patchItem('video', id, { grade: Object.keys(cleaned).length ? cleaned : undefined });
          };
          return (
            <>
              <div style={section}>
                Color{hasGradeEffect ? ' (disabled — this item has its own grade effect)' : ''}
              </div>
              <GradeFields g={g} onPatch={patchGrade} disabled={hasGradeEffect} />
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
              <div style={section}>{humanizeKey(v.kind)}</div>
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
        <NumberField lbl="Music boost (dB)" value={v.musicBoostDb} onCommit={(n) => patchItem('video', id, { musicBoostDb: n })} />
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
                    style={{ background: 'none', border: 'none', color: '#9a9da5', cursor: 'pointer', fontSize: 13 }}
                  >
                    ✕
                  </button>
                }
              >
                <EffectEditor
                  eff={eff as Record<string, unknown>}
                  fields={effectDefinition(meta, type)?.params}
                  accentSlots={accentSlots}
                  onPatch={(patch) =>
                    patchItem('video', id, { effects: v.effects!.map((e, j) => (j === i ? { ...(e as Record<string, unknown>), ...patch } : e)) })
                  }
                />
              </Collapsible>
            );
          })}
        <AddEffectControl
          meta={meta}
          // FIRST editor guard (Phase 4 Task 3.4): `item.grade` already set
          // means adding a `type: 'grade'` effect on top would be a no-op at
          // render time (see `applyStyleEffects`'s dedup) — block it here so
          // the author gets a disabled control instead of a silently inert
          // effect entry.
          blockedTypes={v.grade ? new Set(['grade']) : undefined}
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
          return (
            <>
              <div style={section}>Transition out</div>
              <TransitionFields t={t} accentSlots={slots} meta={meta} onChange={(next) => patchItem('video', id, { transitionOut: next })} />
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
      <div style={panel}>
        <h3 style={heading}>Overlay · {content.kind ?? 'overlay'}</h3>
        <button type="button" style={seekBtn} onClick={() => onSeek(Math.round((o.startMs / 1000) * fps))}>
          ⇥ seek to start
        </button>
        {content.text !== undefined && (
          <div style={field}>
            <label style={label}>Text</label>
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
                    <NumberField lbl="Font size" step={4} value={content.fontSize} onCommit={(n) => patchContent({ fontSize: Math.round(n) })} />
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
          <NumberField lbl="Start (s)" step={0.05} value={o.startMs / 1000} onCommit={(n) => patchItem('overlays', id, { startMs: Math.round(n * 1000) })} />
          <NumberField lbl="End (s)" step={0.05} value={o.endMs / 1000} onCommit={(n) => patchItem('overlays', id, { endMs: Math.round(n * 1000) })} />
        </Row>
      </div>
    );
  }

  if (lane === 'audio') {
    const a = reel.tracks.audio.find((x) => x.id === id);
    if (!a) return null;
    return (
      <div style={panel}>
        <h3 style={heading}>Audio</h3>
        <TextField lbl="Source" value={a.source} onCommit={(s) => s.trim() && patchItem('audio', id, { source: s })} />
        <Row>
          <NumberField lbl="Trim in (s)" step={0.05} value={a.sourceInMs / 1000} disabled={!!a.followsVideoId} title={a.followsVideoId ? 'Linked to a clip — unlink to trim independently' : undefined} onCommit={(n) => patchItem('audio', id, { sourceInMs: Math.round(n * 1000) })} />
          <NumberField
            lbl="Trim out (s)"
            step={0.05}
            value={(a.sourceOutMs ?? a.sourceInMs + (a.endMs - a.startMs)) / 1000}
            disabled={!!a.followsVideoId}
            title={a.followsVideoId ? 'Linked to a clip — unlink to trim independently' : undefined}
            onCommit={(n) => patchItem('audio', id, { sourceOutMs: Math.round(n * 1000) })}
          />
        </Row>
        <Row>
          <NumberField lbl="Volume (dB)" value={a.volumeDb} onCommit={(n) => patchItem('audio', id, { volumeDb: n })} />
        </Row>
        <Row>
          <NumberField lbl="Fade in (s)" step={0.05} value={(a.fadeInMs ?? 0) / 1000} onCommit={(n) => patchItem('audio', id, { fadeInMs: n > 0 ? Math.round(n * 1000) : undefined })} />
          <NumberField lbl="Fade out (s)" step={0.05} value={(a.fadeOutMs ?? 0) / 1000} onCommit={(n) => patchItem('audio', id, { fadeOutMs: n > 0 ? Math.round(n * 1000) : undefined })} />
        </Row>
        {/* Linked audio: bound beds follow their clip through every edit; unlink
            to edit this bed independently. Re-link binds it to the clip under it. */}
        {a.followsVideoId ? (
          <button
            type="button"
            style={linkBtn}
            title={`This bed moves and trims with clip ${a.followsVideoId}. Unlink to edit it on its own.`}
            onClick={() => patchItem('audio', id, { followsVideoId: undefined })}
          >
            🔗 Linked to {a.followsVideoId} · Unlink
          </button>
        ) : (
          <button
            type="button"
            style={linkBtn}
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
            ⛓ Independent · Link to clip
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
      <div style={panel}>
        <h3 style={heading}>Music</h3>
        <TextField lbl="Source" value={m.source} onCommit={(s) => patchMusic({ source: s.trim() || undefined })} />
        <NumberField lbl="Base volume (dB)" value={m.baseVolumeDb} onCommit={(n) => patchMusic({ baseVolumeDb: n })} />
        <NumberField
          lbl="End (s)"
          step={0.05}
          value={(m.endMs ?? reel.meta.totalDurationMs) / 1000}
          onCommit={(n) => patchMusic({ endMs: n > 0 ? Math.round(n * 1000) : undefined })}
        />
        <Row>
          <NumberField lbl="Fade in (s)" step={0.05} value={(m.fadeInMs ?? 0) / 1000} onCommit={(n) => patchMusic({ fadeInMs: n > 0 ? Math.round(n * 1000) : undefined })} />
          <NumberField lbl="Fade out (s)" step={0.05} value={(m.fadeOutMs ?? 1000) / 1000} onCommit={(n) => patchMusic({ fadeOutMs: Math.round(n * 1000) })} />
        </Row>
        <div style={{ fontSize: 11, color: '#5f626a', marginTop: 8 }}>
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
    <div style={panel}>
      <h3 style={heading}>Brand · {b.kind}</h3>
      <Row>
        <NumberField lbl="Start (s)" step={0.05} value={b.startMs / 1000} onCommit={(n) => patchItem('brand', id, { startMs: Math.round(n * 1000) })} />
        <NumberField lbl="End (s)" step={0.05} value={b.endMs / 1000} onCommit={(n) => patchItem('brand', id, { endMs: Math.round(n * 1000) })} />
      </Row>
    </div>
  );
}
