// Pure pixel maths for the transition pixel harness. No I/O, no rendering —
// so `--self-test` can drive every one of these with synthetic frames and prove
// the harness has teeth without spending a render.
import { createHash } from 'node:crypto';

/**
 * The golden value for one still.
 *
 * Hashed over the DECODED RGBA buffer, not the PNG file: the thing this gate
 * is asserting about is the rendered image, and a PNG encoder change (a
 * Chromium bump re-tuning zlib) is not a rendering change. Width and height go
 * into the digest so a resized probe cannot collide with the old one.
 *
 * THIS IS THE COMPARISON THE GATE IS BUILT ON — `verifyFrame` below is where a
 * drifting pixel becomes a red run.
 */
export function hashFrame({ width, height, data }) {
  return createHash('sha256')
    .update(`${width}x${height}:`)
    .update(data)
    .digest('hex');
}

/** Squared euclidean RGB distance. Squared: comparisons only, no sqrt needed. */
function dist2(r, g, b, c) {
  const dr = r - c[0];
  const dg = g - c[1];
  const db = b - c[2];
  return dr * dr + dg * dg + db * db;
}

export function parseHex(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The most frequent exact RGB triple in a frame. Used to DERIVE the probe
 *  plate colours from a rendered reference still, so nothing here restates a
 *  colour literal that lives in `src/TransitionMatrix.tsx`. */
export function modalColor({ data }) {
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0;
  let bestN = -1;
  for (const [key, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = key;
    }
  }
  return [(best >> 16) & 0xff, (best >> 8) & 0xff, best & 0xff];
}

/** Pixels within this RGB distance of a plate colour count as that plate.
 *  Everything further (the white numerals, the grey backdrop, any blend
 *  mid-transition) is deliberately UNCLASSIFIED rather than forced to a side —
 *  the white numeral is nearer orange than blue in RGB and would otherwise bias
 *  every measurement toward the outgoing clip. */
export const CLASSIFY_TOLERANCE = 60;

/**
 * How much of the frame reads as the OUTGOING plate vs the INCOMING one.
 *
 * `share` is B's fraction of the classified pixels — 0 means "purely the
 * outgoing clip", 1 means "purely the incoming clip". `coverage` is what
 * fraction of the frame was classifiable at all, which is how a frame that
 * shows NEITHER plate (a full dip to black, an occluding overlay) is told
 * apart from one that shows a mix.
 */
export function plateShare({ width, height, data }, a, b, tolerance = CLASSIFY_TOLERANCE) {
  const tol2 = tolerance * tolerance;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < data.length; i += 4) {
    const da = dist2(data[i], data[i + 1], data[i + 2], a);
    const db = dist2(data[i], data[i + 1], data[i + 2], b);
    if (da <= tol2 && da <= db) na++;
    else if (db <= tol2) nb++;
  }
  const total = width * height;
  const classified = na + nb;
  return {
    a: na,
    b: nb,
    classified,
    coverage: classified / total,
    share: classified === 0 ? null : nb / classified,
  };
}

/** A frame "shows" a plate when almost all of it is classifiable and almost all
 *  of the classified part is that plate. */
export const SHOWS_COVERAGE = 0.7;
export const SHOWS_SHARE = 0.98;

export function showsOutgoing(m) {
  return m.share !== null && m.coverage >= SHOWS_COVERAGE && m.share <= 1 - SHOWS_SHARE;
}

export function showsIncoming(m) {
  return m.share !== null && m.coverage >= SHOWS_COVERAGE && m.share >= SHOWS_SHARE;
}

/**
 * The semantic checks the contact sheet used to make by human eye. These are
 * the half of the gate that catches a NEW kind repeating an OLD mistake —
 * golden hashes only catch CHANGE, never WRONGNESS.
 *
 * `frames` maps `<mode>__<progressKey>` to a decoded frame. Returns a list of
 * failures; empty means the kind behaves.
 */
export function semanticChecks({ kind, frames, a, b, isInstant }) {
  const fail = [];
  const m = (key) => (frames[key] ? plateShare(frames[key], a, b) : null);

  const fmt = (x) =>
    x === null ? 'missing' : `share=${x.share === null ? 'n/a' : x.share.toFixed(3)} coverage=${x.coverage.toFixed(3)}`;

  // THE discriminator that found the `scanline-glitch` and `wipe` defects:
  // at the start of the transition the composite must still be the clip we are
  // leaving, never the one we are arriving at.
  const cut0 = m('cut__p0');
  if (!cut0 || !showsOutgoing(cut0)) {
    fail.push({ check: 'cut@p0-shows-outgoing', detail: fmt(cut0) });
  }

  // Its mirror: by the end, the composite must be the clip we arrived at.
  const cut1 = m('cut__p1');
  if (!cut1 || !showsIncoming(cut1)) {
    fail.push({ check: 'cut@p1-shows-incoming', detail: fmt(cut1) });
  }

  // A lone clip's own head and tail, which is what ATTRIBUTES a defect to one
  // side of the pair rather than to the composite.
  const enter1 = m('enter__p1');
  if (!enter1 || !showsIncoming(enter1)) {
    fail.push({ check: 'enter@p1-settles-on-clip', detail: fmt(enter1) });
  }
  const exit0 = m('exit__p0');
  if (!exit0 || !showsOutgoing(exit0)) {
    fail.push({ check: 'exit@p0-starts-on-clip', detail: fmt(exit0) });
  }

  // A transition with a duration must actually be MID-transition halfway
  // through. A kind that degrades to a hard cut passes every check above.
  if (!isInstant) {
    const half = frames['cut__p05'];
    if (!half) fail.push({ check: 'cut@p05-present', detail: 'missing' });
    else {
      const h = hashFrame(half);
      const same =
        (frames['cut__p0'] && h === hashFrame(frames['cut__p0'])) ||
        (frames['cut__p1'] && h === hashFrame(frames['cut__p1']));
      if (same) fail.push({ check: 'cut@p05-is-mid-transition', detail: 'identical to p0 or p1 — renders as a hard cut' });
    }
  }

  return fail.map((f) => ({ kind, ...f }));
}

// ---------------------------------------------------------- fingerprints ---
//
// An exact hash answers "byte-identical?", which is the question Task 1.3 has
// to answer. It cannot answer "is this the same picture?", and that second
// question turns out to be necessary: renders here are ALMOST byte-deterministic
// but not quite — measured, roughly one still in 500 comes back with a different
// hash on a curved-edge `cut` frame (`iris`, `clock-wipe`), while eight
// consecutive renders of that same still in isolation agree.
//
// So each golden carries BOTH: the exact hash, and an 8×8 grid of mean RGB. A
// mismatching hash whose grid agrees within FP_TOLERANCE is a rare rasteriser
// wobble and is reported as a non-fatal WARNING; a mismatching hash whose grid
// moves is a real rendering change and fails. The grid is stored as raw means
// rather than a quantised digest on purpose — a digest would flip whenever a
// cell sat on a quantisation boundary, which is the same flakiness one level up.

export const FP_GRID = 8;
/** Max per-channel deviation, in 0-255 units, between two cell means that still
 *  counts as the same picture. One cell averages ~8000 pixels here, so a stray
 *  antialiased edge moves it by <0.01 while any real change to the transition
 *  maths moves it by tens. */
export const FP_TOLERANCE = 2;

export function fingerprint({ width, height, data }) {
  const sums = new Float64Array(FP_GRID * FP_GRID * 3);
  const counts = new Float64Array(FP_GRID * FP_GRID);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(FP_GRID - 1, Math.floor((y * FP_GRID) / height));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(FP_GRID - 1, Math.floor((x * FP_GRID) / width));
      const cell = gy * FP_GRID + gx;
      const i = (y * width + x) * 4;
      sums[cell * 3] += data[i];
      sums[cell * 3 + 1] += data[i + 1];
      sums[cell * 3 + 2] += data[i + 2];
      counts[cell]++;
    }
  }
  const out = Buffer.allocUnsafe(FP_GRID * FP_GRID * 3);
  for (let c = 0; c < FP_GRID * FP_GRID; c++) {
    for (let ch = 0; ch < 3; ch++) out[c * 3 + ch] = Math.round(sums[c * 3 + ch] / counts[c]);
  }
  return out.toString('base64');
}

/** Largest per-channel difference between two fingerprints, or Infinity if they
 *  are not comparable at all. */
export function fingerprintDelta(a, b) {
  if (!a || !b) return Infinity;
  const x = Buffer.from(a, 'base64');
  const y = Buffer.from(b, 'base64');
  if (x.length !== y.length || x.length === 0) return Infinity;
  let max = 0;
  for (let i = 0; i < x.length; i++) max = Math.max(max, Math.abs(x[i] - y[i]));
  return max;
}

/** One golden entry, stored as a single space-separated line so the committed
 *  file stays one reviewable row per still. */
export function encodeGolden(frame) {
  return `${hashFrame(frame)} ${fingerprint(frame)}`;
}

export function decodeGolden(value) {
  if (typeof value !== 'string') return null;
  const [hash, fp] = value.split(' ');
  return { hash, fp };
}

/**
 * THE GOLDEN COMPARISON — the line that turns a changed pixel into a red run.
 *
 *   ok      byte-identical to the golden
 *   near    different bytes, same picture within FP_TOLERANCE (warning)
 *   drift   different picture (failure)
 */
export function verifyFrame(key, frame, goldens) {
  const actual = hashFrame(frame);
  const actualFp = fingerprint(frame);
  const golden = decodeGolden(goldens[key]);
  if (!golden) return { key, actual, actualFp, status: 'missing-golden' };
  if (golden.hash === actual) return { key, actual, actualFp, status: 'ok' };
  const delta = fingerprintDelta(golden.fp, actualFp);
  return {
    key,
    actual,
    actualFp,
    expected: golden.hash,
    delta,
    status: delta <= FP_TOLERANCE ? 'near' : 'drift',
  };
}
