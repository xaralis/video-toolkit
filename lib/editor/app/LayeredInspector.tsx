import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { withTotalDuration } from '@video-toolkit/lib/reel-config-base/total-duration';
import { AccentEditor } from './AccentEditor';
import { Collapsible } from './Collapsible';
import { TRANSITION_KINDS, defaultTransition, kindNeedsFrames, subOptionsFor, type DraftTransition } from './transitions';
import { parseActionId, type LaneId } from '../src/timeline/layered-adapter';
import type { AccentSlot } from '../../theming/palette';
import { PLACEMENTS } from '../../theming/placement';
import { effectCatalog, effectDefinition, humanizeKey, type EditorMeta, type ParamField } from './editor-meta';

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

function NumberField({ lbl, value, step = 1, onCommit, disabled, title }: { lbl: string; value: number | undefined; step?: number; onCommit: (n: number) => void; disabled?: boolean; title?: string }) {
  const f = useLiveField(value === undefined ? '' : String(value));
  return (
    <div style={field} title={title}>
      <label style={label}>{lbl}</label>
      <input
        aria-label={lbl}
        style={disabled ? { ...input, opacity: 0.45, cursor: 'not-allowed' } : input}
        type="number"
        step={step}
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
}: {
  values: Record<string, unknown>;
  fields?: readonly ParamField[];
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const declared = fields ?? [];
  const declaredProps = new Set(declared.map((f) => f.prop));
  const rest = Object.keys(values).filter((k) => !declaredProps.has(k));

  const renderOne = (prop: string, field?: ParamField) => {
    const lbl = field?.label ?? humanizeKey(prop);
    const val = values[prop];
    if (field?.options) {
      return (
        <SelectField
          key={prop}
          lbl={lbl}
          value={typeof val === 'string' ? val : undefined}
          options={[...field.options]}
          onChange={(s) => onPatch({ [prop]: s })}
        />
      );
    }
    // A DECLARED type wins over the value's own — it is the only thing that can
    // type a field whose key the item does not carry yet. Without it an absent
    // numeric prop falls through to TextField and commits a string ("0.5") into
    // the bag; the renderer coerces, but the saved config goes type-dirty.
    const t = field?.type ?? typeof val;
    if (t === 'number')
      return (
        <NumberField
          key={prop}
          lbl={lbl}
          step={0.1}
          value={typeof val === 'number' ? val : undefined}
          onCommit={(n) => onPatch({ [prop]: n })}
        />
      );
    if (t === 'boolean')
      return (
        <CheckboxField key={prop} lbl={lbl} value={typeof val === 'boolean' ? val : false} onChange={(b) => onPatch({ [prop]: b })} />
      );
    if (t === 'string' || val === undefined || val === null)
      return (
        <TextField
          key={prop}
          lbl={lbl}
          value={typeof val === 'string' ? val : ''}
          onCommit={(s) => onPatch({ [prop]: s })}
        />
      );
    return null; // nested object/array — not editable as a single field
  };

  const nodes = [...declared.map((f) => renderOne(f.prop, f)), ...rest.map((p) => renderOne(p))].filter(Boolean);
  if (!nodes.length) return <div style={{ fontSize: 11, color: '#7a7d85', padding: '3px 0' }}>No editable params.</div>;
  return <>{nodes}</>;
}

const TRANSITION_LABEL: Record<string, string> = Object.fromEntries(TRANSITION_KINDS.map((k) => [k.kind, k.label]));

// Shared full-catalog transition editor — kind + whatever contextual
// sub-options that kind needs (subOptionsFor) + a length field gated by
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
function TransitionFields({
  t,
  onChange,
  accentSlots,
}: {
  t: DraftTransition;
  onChange: (next: DraftTransition) => void;
  accentSlots?: readonly AccentSlot[];
}) {
  const kind = t.kind ?? 'cut';
  return (
    <>
      <SelectField
        lbl="Kind"
        value={kind}
        options={TRANSITION_KINDS.map((k) => k.kind)}
        optionLabel={(k) => TRANSITION_LABEL[k] ?? k}
        onChange={(nextKind) => onChange(defaultTransition(nextKind, { frames: t.frames }))}
      />
      {/* One control per SubOption.kind. Dispatch explicitly (not
          enum-or-else-number) so a kind added to SubOption without a control
          here renders nothing visible instead of a wrong-typed field. */}
      {subOptionsFor(kind).map((opt) => {
        // A brand-palette dropdown: the schema supplies no `options` for an
        // accent field, so the brand's slots are the option list. With no
        // brand palette in scope there is nothing to choose from, so the
        // control is omitted rather than shown empty.
        if (opt.kind === 'accent') {
          const slots = accentSlots ?? [];
          if (!slots.length) return null;
          return (
            <SelectField
              key={opt.prop}
              lbl={opt.label}
              value={t[opt.prop] as string | undefined}
              options={slots.map((s) => s.key)}
              optionLabel={(v) => slots.find((s) => s.key === v)?.label ?? v}
              onChange={(s) => onChange({ ...t, [opt.prop]: s })}
            />
          );
        }
        if (opt.kind === 'enum')
          return (
            <SelectField
              key={opt.prop}
              lbl={opt.label}
              value={t[opt.prop] as string | undefined}
              options={(opt.options ?? []).map((o) => o.value)}
              optionLabel={(v) => opt.options?.find((o) => o.value === v)?.label ?? v}
              onChange={(s) => onChange({ ...t, [opt.prop]: s })}
            />
          );
        if (opt.kind === 'boolean')
          return (
            <CheckboxField
              key={opt.prop}
              lbl={opt.label}
              value={t[opt.prop] as boolean | undefined}
              onChange={(b) => onChange({ ...t, [opt.prop]: b })}
            />
          );
        return (
          <NumberField
            key={opt.prop}
            lbl={opt.label}
            value={t[opt.prop] as number | undefined}
            onCommit={(n) => onChange({ ...t, [opt.prop]: n })}
          />
        );
      })}
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

const BLEND_DIRECTIONS = ['tl-br', 'tr-bl', 'bl-tr', 'br-tl'];
// The position dropdown offers exactly the canonical placement vocabulary —
// deriving it (instead of a hand-copied list) is what keeps the dropdown, the
// Placement type, and the geometry map from drifting apart again. A legacy
// persisted value outside the list (e.g. `center-left`) still displays via
// SelectField's unknown-value prepend and renders via PLACEMENT_ALIASES.
const OVERLAY_POSITIONS: string[] = [...PLACEMENTS];

// Editable params (BODY only — the collapsible header + remove ✕ are supplied by
// the caller's <Collapsible>) for one effect. Core has a bespoke editor for the
// two effects it OWNS — ken-burns (rendered by SegmentMedia; two legitimate
// shapes) and blend (emitted by core's own derivation) — and renders every other
// effect through ParamFields: brand-declared fields when the catalog declares
// them, else typed by the values the effect currently holds.
function EffectEditor({
  eff,
  fields,
  onPatch,
}: {
  eff: Record<string, unknown>;
  fields?: readonly ParamField[];
  onPatch: (patch: Record<string, unknown>) => void;
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
  return <ParamFields values={params} fields={fields} onPatch={onPatch} />;
}

const seekBtn: React.CSSProperties = { ...input, cursor: 'pointer', marginBottom: 10, width: 'auto', padding: '4px 10px' };
const linkBtn: React.CSSProperties = { ...input, cursor: 'pointer', marginTop: 4, width: '100%', padding: '6px 10px', textAlign: 'left', fontSize: 12 };
const readonlyValue: React.CSSProperties = { fontSize: 13, color: '#c8cbd2', padding: '3px 0' };

// The addable effects: core's own catalog plus whatever the brand declared.
// Core ships only what core RENDERS (ken-burns via SegmentMedia) — every other
// effect is a brand's and arrives through EditorMeta.effects.
function AddEffectControl({ meta, onAdd }: { meta?: EditorMeta; onAdd: (effect: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const catalog = effectCatalog(meta);
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ ...seekBtn, marginBottom: 4 }}>+ Add effect</button>
      {open &&
        catalog.map((e) => (
          <button key={e.type} type="button" onClick={() => { onAdd({ type: e.type, ...(e.defaults ?? {}) }); setOpen(false); }}
            style={{ ...linkBtn }}>{e.label ?? e.type}</button>
        ))}
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
    const t = (v[edgeField] ?? { kind: 'cut' }) as DraftTransition;
    const kind = t.kind ?? 'cut';
    return (
      <div style={panel}>
        <h3 style={heading}>
          Transition {edge === 'in' ? 'in' : 'out'} · {TRANSITION_LABEL[kind] ?? kind}
        </h3>
        <TransitionFields t={t} accentSlots={slots} onChange={(next) => patchItem('video', id, { [edgeField]: next })} />
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
        {/* Per-clip colour grade (brightness/contrast/saturation are native CSS
            filters; temperature/tint drive an SVG white-balance matrix). Applies
            to the SegmentMedia-rendered footage kinds. Neutral = 1 (b/c/s) / 0
            (temp/tint); neutral values are dropped so `grade` stays minimal. */}
        {(v.kind === 'clip' || v.kind === 'broll' || v.kind === 'photo') && (() => {
          const g = (v.grade ?? {}) as { brightness?: number; contrast?: number; saturation?: number; temperature?: number; tint?: number };
          const patchGrade = (patch: Record<string, number>) => {
            const merged = { ...g, ...patch } as Record<string, number>;
            const cleaned = Object.fromEntries(
              Object.entries(merged).filter(([k, val]) => typeof val === 'number' && val !== (k === 'temperature' || k === 'tint' ? 0 : 1)),
            );
            patchItem('video', id, { grade: Object.keys(cleaned).length ? cleaned : undefined });
          };
          return (
            <>
              <div style={section}>Color</div>
              <Row>
                <NumberField lbl="Brightness" step={0.05} value={g.brightness ?? 1} onCommit={(n) => patchGrade({ brightness: n })} />
                <NumberField lbl="Contrast" step={0.05} value={g.contrast ?? 1} onCommit={(n) => patchGrade({ contrast: n })} />
              </Row>
              <Row>
                <NumberField lbl="Saturation" step={0.05} value={g.saturation ?? 1} onCommit={(n) => patchGrade({ saturation: n })} />
                <NumberField lbl="Temperature" step={0.05} value={g.temperature ?? 0} onCommit={(n) => patchGrade({ temperature: n })} />
              </Row>
              <NumberField lbl="Tint" step={0.05} value={g.tint ?? 0} onCommit={(n) => patchGrade({ tint: n })} />
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
          const raw = v.transitionOut as { kind?: string } | undefined;
          const t: DraftTransition = raw && TRANSITION_KINDS.some((k) => k.kind === raw.kind) ? (raw as DraftTransition) : { kind: 'cut' };
          return (
            <>
              <div style={section}>Transition out</div>
              <TransitionFields t={t} accentSlots={slots} onChange={(next) => patchItem('video', id, { transitionOut: next })} />
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
        {/* Overlay kinds that carry reveal/hide + font size (e.g. a stacked pull-quote). */}
        {(content.reveal !== undefined || content.hide !== undefined || content.fontSize !== undefined) && (
          <>
            <Row>
              <SelectField lbl="Reveal" value={content.reveal ?? 'line'} options={['line', 'all', 'none']} onChange={(s) => patchContent({ reveal: s })} />
              <SelectField lbl="Hide" value={content.hide ?? 'fade'} options={['fade', 'none']} onChange={(s) => patchContent({ hide: s })} />
            </Row>
            <NumberField lbl="Font size" step={4} value={content.fontSize} onCommit={(n) => patchContent({ fontSize: Math.round(n) })} />
          </>
        )}
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
