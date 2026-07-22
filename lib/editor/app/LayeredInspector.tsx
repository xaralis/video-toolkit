import { useEffect, useState, type ReactNode } from 'react';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { AccentEditor } from './AccentEditor';
import { TRANSITION_KINDS, defaultTransition, kindNeedsFrames, subOptionsFor, type Transition } from './transitions';
import { parseActionId, type LaneId } from '../src/timeline/layered-adapter';

// Routes the selected timeline item (by lane) to its editable properties,
// reusing the existing content editors. Edits produce a new LayeredReel via
// `onChange`. The single-track Inspector is replaced by this per-lane router.

export interface LayeredInspectorProps {
  reel: LayeredReel;
  selectedId: string | null; // action id `${lane}:${itemId}`
  onChange: (next: LayeredReel) => void;
  onSeek: (frame: number) => void;
  fps: number;
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

// Commits LIVE as you type (each valid value) so the preview reflects changes
// immediately — not only on blur. Controlled local text state resyncs from the
// external `value` only when it diverges (an edit from elsewhere / undo), so a
// self-commit never fights the caret mid-type.
function NumberField({ lbl, value, step = 1, onCommit }: { lbl: string; value: number | undefined; step?: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState<string>(value === undefined ? '' : String(value));
  useEffect(() => {
    if (value === undefined) {
      if (text !== '') setText('');
    } else if (Number(text) !== value) {
      setText(String(value));
    }
    // resync only on external `value` change — intentionally not keyed on `text`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div style={field}>
      <label style={label}>{lbl}</label>
      <input
        style={input}
        type="number"
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
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
  return (
    <div style={field}>
      <label style={label}>{lbl}</label>
      <input style={input} type="text" defaultValue={value ?? ''} onBlur={(e) => onCommit(e.target.value)} key={value} />
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
const OVERLAY_POSITIONS = [
  'upper-left', 'upper-center', 'upper-right',
  'center-left', 'center', 'center-right',
  'lower-left', 'lower-center', 'lower-right',
];

// Editable params per effect type (Ken Burns motion, blend crossfade).
function EffectEditor({ eff, onPatch }: { eff: Record<string, unknown>; onPatch: (patch: Record<string, unknown>) => void }) {
  const type = eff.type as string;
  const num = (k: string) => (typeof eff[k] === 'number' ? (eff[k] as number) : undefined);
  if (type === 'ken-burns') {
    return (
      <>
        <div style={section}>Effect · ken-burns</div>
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
        <div style={section}>Effect · blend</div>
        <TextField lbl="To source" value={eff.to as string | undefined} onCommit={(s) => onPatch({ to: s || undefined })} />
        <SelectField lbl="Direction" value={eff.direction as string | undefined} options={BLEND_DIRECTIONS} onChange={(s) => onPatch({ direction: s })} />
        <Row>
          <NumberField lbl="Start %" value={num('startPct')} onCommit={(n) => onPatch({ startPct: n })} />
          <NumberField lbl="End %" value={num('endPct')} onCommit={(n) => onPatch({ endPct: n })} />
        </Row>
      </>
    );
  }
  return <div style={section}>Effect · {type}</div>;
}

const seekBtn: React.CSSProperties = { ...input, cursor: 'pointer', marginBottom: 10, width: 'auto', padding: '4px 10px' };

export function LayeredInspector({ reel, selectedId, onChange, onSeek, fps }: LayeredInspectorProps) {
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
        <div style={field}>
          <label style={label}>Topic</label>
          <div style={{ ...input, background: '#161719' }}>{reel.meta.topic}</div>
        </div>
        <div style={field}>
          <label style={label}>Total duration</label>
          <div style={{ ...input, background: '#161719' }}>{(reel.meta.totalDurationMs / 1000).toFixed(2)}s</div>
        </div>
        <div style={field}>
          <label style={label}>Music</label>
          <div style={{ ...input, background: '#161719' }}>{reel.tracks.music.source ?? '(none)'} · base {reel.tracks.music.baseVolumeDb}dB</div>
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
                value={1 / ((v.crop as { width?: number } | undefined)?.width ?? 1)}
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
        <NumberField lbl="Music boost (dB)" value={v.musicBoostDb} onCommit={(n) => patchItem('video', id, { musicBoostDb: n })} />
        {v.effects &&
          v.effects.map((eff, i) => (
            <EffectEditor
              key={i}
              eff={eff as Record<string, unknown>}
              onPatch={(patch) =>
                patchItem('video', id, { effects: v.effects!.map((e, j) => (j === i ? { ...(e as Record<string, unknown>), ...patch } : e)) })
              }
            />
          ))}
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
    const content = o.content as { kind?: string; text?: string };
    return (
      <div style={panel}>
        <h3 style={heading}>Overlay · {content.kind ?? 'overlay'}</h3>
        <button type="button" style={seekBtn} onClick={() => onSeek(Math.round((o.startMs / 1000) * fps))}>
          ⇥ seek to start
        </button>
        {content.text !== undefined && (
          <div style={field}>
            <label style={label}>Text</label>
            <AccentEditor value={content.text ?? ''} onChange={(next) => patchItem('overlays', id, { content: { ...o.content, text: next } })} />
          </div>
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
          <NumberField lbl="In-point (s)" step={0.05} value={a.sourceInMs / 1000} onCommit={(n) => patchItem('audio', id, { sourceInMs: Math.round(n * 1000) })} />
          <NumberField lbl="Volume (dB)" value={a.volumeDb} onCommit={(n) => patchItem('audio', id, { volumeDb: n })} />
        </Row>
      </div>
    );
  }

  if (lane === 'music') {
    const m = reel.tracks.music;
    const patchMusic = (patch: Record<string, unknown>) => onChange({ ...reel, tracks: { ...reel.tracks, music: { ...m, ...patch } } });
    return (
      <div style={panel}>
        <h3 style={heading}>Music</h3>
        <TextField lbl="Source" value={m.source} onCommit={(s) => patchMusic({ source: s.trim() || undefined })} />
        <NumberField lbl="Base volume (dB)" value={m.baseVolumeDb} onCommit={(n) => patchMusic({ baseVolumeDb: n })} />
        <div style={{ fontSize: 11, color: '#5f626a', marginTop: 8 }}>The effective envelope (base + each clip’s music boost) is drawn on the Music lane.</div>
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
