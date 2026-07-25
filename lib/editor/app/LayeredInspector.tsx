import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { AccentEditor } from './AccentEditor';
import { TransitionPicker } from './TransitionPicker';
import { TRANSITION_KINDS, type Transition } from './transitions';
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

const label: React.CSSProperties = { fontSize: 11, color: '#7a7d85', display: 'block', marginBottom: 3 };
const field: React.CSSProperties = { marginBottom: 12 };
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
const heading: React.CSSProperties = { fontSize: 12, color: '#e8e8ea', margin: '0 0 12px', fontWeight: 600 };

function NumberField({ lbl, value, step = 1, onCommit }: { lbl: string; value: number | undefined; step?: number; onCommit: (n: number) => void }) {
  return (
    <div style={field}>
      <label style={label}>{lbl}</label>
      <input
        key={value}
        style={input}
        type="number"
        step={step}
        defaultValue={value ?? ''}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (raw === '') return; // cleared field → no-op, don't coerce to 0
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

export function LayeredInspector({ reel, selectedId, onChange, onSeek, fps }: LayeredInspectorProps) {
  const patchItem = (lane: LaneId, id: string, patch: Record<string, unknown>) => {
    const key = lane as keyof LayeredReel['tracks'];
    const arr = reel.tracks[key] as Array<{ id: string }>;
    const next = arr.map((it) => (it.id === id ? { ...it, ...patch } : it));
    onChange({ ...reel, tracks: { ...reel.tracks, [lane]: next } });
  };

  if (!selectedId) {
    return (
      <div style={{ padding: 14 }}>
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

  const { lane, id } = parseActionId(selectedId);

  if (lane === 'video') {
    const v = reel.tracks.video.find((x) => x.id === id);
    if (!v) return null;
    return (
      <div style={{ padding: 14 }}>
        <h3 style={heading}>Clip · {v.kind}</h3>
        <button type="button" style={{ ...input, cursor: 'pointer', marginBottom: 12, width: 'auto', padding: '4px 10px' }} onClick={() => onSeek(Math.round((v.startMs / 1000) * fps))}>
          ⇥ seek to start
        </button>
        {v.source !== undefined && <TextField lbl="Source" value={v.source} onCommit={(s) => s.trim() && patchItem('video', id, { source: s })} />}
        {v.sourceInMs !== undefined && (
          <NumberField lbl="Trim in (s)" step={0.05} value={v.sourceInMs / 1000} onCommit={(n) => patchItem('video', id, { sourceInMs: Math.round(n * 1000) })} />
        )}
        {v.sourceOutMs !== undefined && (
          <NumberField lbl="Trim out (s)" step={0.05} value={v.sourceOutMs / 1000} onCommit={(n) => patchItem('video', id, { sourceOutMs: Math.round(n * 1000) })} />
        )}
        {(v.kind === 'clip' || v.kind === 'broll') && (
          <>
            <NumberField lbl="Focal X (0–1)" step={0.01} value={v.focalX} onCommit={(n) => patchItem('video', id, { focalX: n })} />
            <NumberField lbl="Focal Y (0–1)" step={0.01} value={v.focalY} onCommit={(n) => patchItem('video', id, { focalY: n })} />
          </>
        )}
        <TextField lbl="Audio mode" value={v.audioMode} onCommit={(s) => patchItem('video', id, { audioMode: s || undefined })} />
        <NumberField lbl="Music boost (dB)" value={v.musicBoostDb} onCommit={(n) => patchItem('video', id, { musicBoostDb: n })} />
        {v.effects && v.effects.length > 0 && (
          <div style={field}>
            <label style={label}>Effects</label>
            <div style={{ fontSize: 11, color: '#9a9da5' }}>{v.effects.map((e) => (e as { type?: string }).type ?? '?').join(', ')}</div>
          </div>
        )}
        <div style={field}>
          <label style={label}>Transition out</label>
          <TransitionPicker
            value={
              v.transitionOut && TRANSITION_KINDS.some((k) => k.kind === (v.transitionOut as { kind?: string }).kind)
                ? (v.transitionOut as unknown as Transition)
                : undefined
            }
            fps={fps}
            onChange={(t) => patchItem('video', id, { transitionOut: t })}
          />
        </div>
      </div>
    );
  }

  if (lane === 'overlays') {
    const o = reel.tracks.overlays.find((x) => x.id === id);
    if (!o) return null;
    const content = o.content as { kind?: string; text?: string };
    return (
      <div style={{ padding: 14 }}>
        <h3 style={heading}>Overlay · {content.kind ?? 'overlay'}</h3>
        <button type="button" style={{ ...input, cursor: 'pointer', marginBottom: 12, width: 'auto', padding: '4px 10px' }} onClick={() => onSeek(Math.round((o.startMs / 1000) * fps))}>
          ⇥ seek to start
        </button>
        {content.text !== undefined && (
          <div style={field}>
            <label style={label}>Text</label>
            <AccentEditor value={content.text ?? ''} onChange={(next) => patchItem('overlays', id, { content: { ...o.content, text: next } })} />
          </div>
        )}
        {o.position !== undefined && <TextField lbl="Position" value={o.position} onCommit={(s) => patchItem('overlays', id, { position: s })} />}
        <NumberField lbl="Start (s)" step={0.05} value={o.startMs / 1000} onCommit={(n) => patchItem('overlays', id, { startMs: Math.round(n * 1000) })} />
        <NumberField lbl="End (s)" step={0.05} value={o.endMs / 1000} onCommit={(n) => patchItem('overlays', id, { endMs: Math.round(n * 1000) })} />
      </div>
    );
  }

  if (lane === 'audio') {
    const a = reel.tracks.audio.find((x) => x.id === id);
    if (!a) return null;
    return (
      <div style={{ padding: 14 }}>
        <h3 style={heading}>Audio</h3>
        <TextField lbl="Source" value={a.source} onCommit={(s) => s.trim() && patchItem('audio', id, { source: s })} />
        <NumberField lbl="In-point (s)" step={0.05} value={a.sourceInMs / 1000} onCommit={(n) => patchItem('audio', id, { sourceInMs: Math.round(n * 1000) })} />
        <NumberField lbl="Volume (dB)" value={a.volumeDb} onCommit={(n) => patchItem('audio', id, { volumeDb: n })} />
      </div>
    );
  }

  // brand
  const b = reel.tracks.brand.find((x) => x.id === id);
  if (!b) return null;
  return (
    <div style={{ padding: 14 }}>
      <h3 style={heading}>Brand · {b.kind}</h3>
      <NumberField lbl="Start (s)" step={0.05} value={b.startMs / 1000} onCommit={(n) => patchItem('brand', id, { startMs: Math.round(n * 1000) })} />
      <NumberField lbl="End (s)" step={0.05} value={b.endMs / 1000} onCommit={(n) => patchItem('brand', id, { endMs: Math.round(n * 1000) })} />
    </div>
  );
}
