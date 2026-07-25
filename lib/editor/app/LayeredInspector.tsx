import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { withTotalDuration } from '@video-toolkit/lib/reel-config-base/total-duration';
import { AccentEditor } from './AccentEditor';
import { Collapsible } from './Collapsible';
import { TRANSITION_KINDS, defaultTransition, kindNeedsFrames, subOptionsFor, type Transition } from './transitions';
import { parseActionId, type LaneId } from '../src/timeline/layered-adapter';
import type { AccentSlot } from '../../theming/palette';
import { PLACEMENTS } from '../../theming/placement';

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
      <select style={input} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
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
const TRANSITION_LABEL: Record<string, string> = Object.fromEntries(TRANSITION_KINDS.map((k) => [k.kind, k.label]));

// Shared full-catalog transition editor — kind + whatever contextual
// sub-options that kind needs (subOptionsFor) + a length field gated by
// kindNeedsFrames. Used both by the video-lane "Transition out" section and
// the transitions-lane route (which targets transitionIn or transitionOut
// depending on `edge`), so the two never diverge again.
function TransitionFields({ t, onChange }: { t: Transition; onChange: (next: Transition) => void }) {
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
      {subOptionsFor(kind).map((opt) =>
        opt.kind === 'enum' ? (
          <SelectField
            key={opt.prop}
            lbl={opt.label}
            value={t[opt.prop] as string | undefined}
            options={(opt.options ?? []).map((o) => o.value)}
            optionLabel={(v) => opt.options?.find((o) => o.value === v)?.label ?? v}
            onChange={(s) => onChange({ ...t, [opt.prop]: s })}
          />
        ) : (
          <NumberField
            key={opt.prop}
            lbl={opt.label}
            value={t[opt.prop] as number | undefined}
            onCommit={(n) => onChange({ ...t, [opt.prop]: n })}
          />
        ),
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

const BLEND_DIRECTIONS = ['tl-br', 'tr-bl', 'bl-tr', 'br-tl'];
// The position dropdown offers exactly the canonical placement vocabulary —
// deriving it (instead of a hand-copied list) is what keeps the dropdown, the
// Placement type, and the geometry map from drifting apart again. A legacy
// persisted value outside the list (e.g. `center-left`) still displays via
// SelectField's unknown-value prepend and renders via PLACEMENT_ALIASES.
const OVERLAY_POSITIONS: string[] = [...PLACEMENTS];

// Editable params (BODY only — the collapsible header + remove ✕ are supplied by
// the caller's <Collapsible>) per effect type: Ken Burns motion, blend crossfade,
// vintage film/vhs grade.
function EffectEditor({ eff, onPatch }: { eff: Record<string, unknown>; onPatch: (patch: Record<string, unknown>) => void }) {
  const type = eff.type as string;
  const num = (k: string) => (typeof eff[k] === 'number' ? (eff[k] as number) : undefined);
  if (type === 'ken-burns') {
    // Ken Burns has TWO shapes (both render, see SegmentMedia): the `direction`
    // shorthand (roost — in/left/up) and explicit from/to pan+zoom (campaign).
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
  if (type === 'vintage') {
    return (
      <SelectField lbl="Mode" value={eff.mode as string | undefined} options={['film', 'vhs']} onChange={(s) => onPatch({ mode: s })} />
    );
  }
  return <div style={{ fontSize: 11, color: '#7a7d85', padding: '3px 0' }}>No editable params.</div>;
}

const seekBtn: React.CSSProperties = { ...input, cursor: 'pointer', marginBottom: 10, width: 'auto', padding: '4px 10px' };
const linkBtn: React.CSSProperties = { ...input, cursor: 'pointer', marginTop: 4, width: '100%', padding: '6px 10px', textAlign: 'left', fontSize: 12 };
const readonlyValue: React.CSSProperties = { fontSize: 13, color: '#c8cbd2', padding: '3px 0' };

const EFFECT_DEFAULTS: Record<string, Record<string, unknown>> = {
  vintage: { type: 'vintage', mode: 'film' },
  'ken-burns': { type: 'ken-burns', fromScale: 1, toScale: 1.08, fromX: 0.5, toX: 0.5 },
};

// Outro option lists (roost's outro variations — shown only for an outro item
// that carries `props`, i.e. the montage brands; campaign's parameterless outro
// has no props so these never render there).
const OUTRO_STYLES = ['organic', 'fade', 'bloom', 'static', 'heartbeat'];
const OUTRO_VARIANTS = ['sand-brown', 'white-black'];

function AddEffectControl({ onAdd }: { onAdd: (kind: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ ...seekBtn, marginBottom: 4 }}>+ Add effect</button>
      {open &&
        Object.keys(EFFECT_DEFAULTS).map((k) => (
          <button key={k} type="button" onClick={() => { onAdd(k); setOpen(false); }}
            style={{ ...linkBtn }}>{k}</button>
        ))}
    </div>
  );
}

export function LayeredInspector({ reel, selectedId, onChange, onSeek, fps, accentSlots }: LayeredInspectorProps) {
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
    const t = (v[edgeField] ?? { kind: 'cut' }) as Transition;
    const kind = t.kind ?? 'cut';
    return (
      <div style={panel}>
        <h3 style={heading}>
          Transition {edge === 'in' ? 'in' : 'out'} · {TRANSITION_LABEL[kind] ?? kind}
        </h3>
        <TransitionFields t={t} onChange={(next) => patchItem('video', id, { [edgeField]: next })} />
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
        {v.kind === 'outro' && v.props && (
          <>
            <div style={section}>Outro</div>
            <SelectField lbl="Style" value={(v.props as Record<string, unknown>).style as string | undefined} options={OUTRO_STYLES} onChange={(s) => patchItem('video', id, { props: { ...(v.props as object), style: s } })} />
            <SelectField lbl="Variant" value={(v.props as Record<string, unknown>).variant as string | undefined} options={OUTRO_VARIANTS} onChange={(s) => patchItem('video', id, { props: { ...(v.props as object), variant: s } })} />
            {/* The into-outro transition now lives on the PREVIOUS clip's
                transitionOut (at-cut) — edit it via that clip's transition, not here. */}
            <NumberField lbl="Logo delay (s)" step={0.1} value={(v.props as Record<string, unknown>).logoDelaySec as number | undefined} onCommit={(n) => patchItem('video', id, { props: { ...(v.props as object), logoDelaySec: n } })} />
          </>
        )}
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
                  onPatch={(patch) =>
                    patchItem('video', id, { effects: v.effects!.map((e, j) => (j === i ? { ...(e as Record<string, unknown>), ...patch } : e)) })
                  }
                />
              </Collapsible>
            );
          })}
        <AddEffectControl
          onAdd={(kind) => patchItem('video', id, { effects: [...(v.effects ?? []), EFFECT_DEFAULTS[kind]] })}
        />
          </>
        )}
        {(() => {
          const raw = v.transitionOut as { kind?: string } | undefined;
          const t: Transition = raw && TRANSITION_KINDS.some((k) => k.kind === raw.kind) ? (raw as Transition) : { kind: 'cut' };
          return (
            <>
              <div style={section}>Transition out</div>
              <TransitionFields t={t} onChange={(next) => patchItem('video', id, { transitionOut: next })} />
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
            {/* Multi-line WYSIWYG accent editor — a quote-pull can span several
                lines (the roost teaser is a multi-line quote-pull). */}
            <AccentEditor value={content.text ?? ''} onChange={(next) => patchContent({ text: next })} colors={accentSlots} multiline />
          </div>
        )}
        {/* Roost quote-pulls (the stacked teaser look) carry reveal/hide + font size. */}
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
