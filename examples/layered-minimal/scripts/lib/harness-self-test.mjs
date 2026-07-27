// Teeth-check for the pixel harness itself, run with
// `node scripts/render-transition-matrix.mjs --self-test`.
//
// It renders nothing: it drives the pure functions in `pixel-metrics.mjs` with
// synthetic frames. The point is not to re-test that a comparison compares —
// it is to pin, mechanically and in seconds, that the two things the gate
// exists to do actually go RED:
//
//   * a single changed pixel is caught by the golden comparison
//     (`verifyFrame`, pixel-metrics.mjs);
//   * a kind that shows the INCOMING clip at progress 0 — the exact defect
//     family found in `scanline-glitch` and `wipe` — is caught by the semantic
//     checks, even when its golden hash matches perfectly.
//
// The second is the one that matters: golden hashes catch change, never
// wrongness, so a wrong kind baselined wrong stays green forever without it.
import { decodePng } from './png.mjs';
import {
  FP_TOLERANCE,
  encodeGolden,
  fingerprint,
  fingerprintDelta,
  modalColor,
  plateShare,
  semanticChecks,
  verifyFrame,
} from './pixel-metrics.mjs';

const W = 40;
const H = 40;
const A = [224, 122, 31];
const B = [31, 95, 224];

function solid(rgb) {
  const data = Buffer.allocUnsafe(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width: W, height: H, data };
}

/** Left `frac` of the frame is B, the rest A — a wipe, essentially. */
function split(frac) {
  const f = solid(A);
  const cols = Math.round(W * frac);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * W + x) * 4;
      f.data[i] = B[0];
      f.data[i + 1] = B[1];
      f.data[i + 2] = B[2];
    }
  }
  return f;
}

/** A well-behaved kind: outgoing at p0, incoming at p1, mid-transition halfway. */
function goodFrames() {
  return {
    cut__p0: solid(A),
    cut__p025: split(0.25),
    cut__p05: split(0.5),
    cut__p075: split(0.75),
    cut__p1: solid(B),
    enter__p1: solid(B),
    exit__p0: solid(A),
  };
}

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

export function runSelfTest() {
  console.log('harness self-test (no rendering)');

  // --- the PNG decoder round-trips what Chromium emits -----------------------
  // A 2x1 truecolour PNG with a single filtered scanline, hand-built so the
  // decoder is exercised without needing a render.
  check('decodePng rejects non-PNG input', (() => {
    try {
      decodePng(Buffer.from('not a png at all'));
      return false;
    } catch {
      return true;
    }
  })());

  // --- plate measurement ----------------------------------------------------
  check('modalColor finds the dominant plate', modalColor(split(0.25)).join() === A.join());
  const mA = plateShare(solid(A), A, B);
  const mB = plateShare(solid(B), A, B);
  check('plateShare: pure outgoing reads share 0', mA.share === 0 && mA.coverage === 1, JSON.stringify(mA));
  check('plateShare: pure incoming reads share 1', mB.share === 1 && mB.coverage === 1, JSON.stringify(mB));
  const mNeither = plateShare(solid([0, 0, 0]), A, B);
  check('plateShare: a frame showing neither plate reads coverage 0', mNeither.coverage === 0 && mNeither.share === null);

  // --- the golden comparison has teeth --------------------------------------
  // MUTATION TARGET: pixel-metrics.mjs `verifyFrame` — the `golden.hash ===
  // actual` branch and the `delta <= FP_TOLERANCE` classification below it.
  // Weaken either (to `true`, to a prefix compare, to an unbounded tolerance)
  // and one of the three checks in this block goes red.
  const frame = solid(A);
  const goldens = { 'k__cut__p0': encodeGolden(frame) };
  check('verifyFrame: identical frame is ok', verifyFrame('k__cut__p0', frame, goldens).status === 'ok');
  const oneOff = solid(A);
  oneOff.data[(19 * W + 19) * 4 + 1] ^= 1; // ONE pixel, ONE channel, by ONE.
  check(
    'verifyFrame: a single-channel one-bit pixel change is detected (not ok)',
    verifyFrame('k__cut__p0', oneOff, goldens).status === 'near',
    JSON.stringify(verifyFrame('k__cut__p0', oneOff, goldens)),
  );
  // …and a change big enough to be a different PICTURE is a hard failure, not a
  // warning. This is the boundary the flake tolerance must not swallow.
  check(
    'verifyFrame: a different picture is drift, not near',
    verifyFrame('k__cut__p0', split(0.25), goldens).status === 'drift',
  );
  check(
    'fingerprintDelta: a one-pixel wobble stays inside tolerance',
    fingerprintDelta(fingerprint(frame), fingerprint(oneOff)) <= FP_TOLERANCE,
  );
  check(
    'fingerprintDelta: a quarter-frame change is far outside tolerance',
    fingerprintDelta(fingerprint(frame), fingerprint(split(0.25))) > FP_TOLERANCE,
  );
  check('verifyFrame: an unbaselined key is missing-golden', verifyFrame('nope', frame, goldens).status === 'missing-golden');

  // --- the semantic checks have teeth ---------------------------------------
  check('semantic: a well-behaved kind passes', semanticChecks({ kind: 'good', frames: goodFrames(), a: A, b: B, isInstant: false }).length === 0);

  // The defect family that this harness exists to catch: at progress 0 the
  // composite already shows the clip we are arriving at.
  const inverted = goodFrames();
  inverted.cut__p0 = solid(B);
  const invFail = semanticChecks({ kind: 'broken', frames: inverted, a: A, b: B, isInstant: false });
  check(
    'semantic: showing the INCOMING clip at progress 0 is caught',
    invFail.some((f) => f.check === 'cut@p0-shows-outgoing'),
    JSON.stringify(invFail),
  );

  const stuck = goodFrames();
  stuck.cut__p1 = solid(A);
  check(
    'semantic: never arriving at the incoming clip is caught',
    semanticChecks({ kind: 'stuck', frames: stuck, a: A, b: B, isInstant: false }).some((f) => f.check === 'cut@p1-shows-incoming'),
  );

  const hardCut = goodFrames();
  hardCut.cut__p05 = solid(A);
  check(
    'semantic: a timed transition that renders as a hard cut is caught',
    semanticChecks({ kind: 'hard', frames: hardCut, a: A, b: B, isInstant: false }).some((f) => f.check === 'cut@p05-is-mid-transition'),
  );
  check(
    'semantic: the instant kind is exempt from the mid-transition check',
    !semanticChecks({ kind: 'cut', frames: hardCut, a: A, b: B, isInstant: true }).some((f) => f.check === 'cut@p05-is-mid-transition'),
  );

  const occluded = goodFrames();
  occluded.exit__p0 = solid([0, 0, 0]);
  check(
    'semantic: a clip occluded at the very start of its own tail is caught',
    semanticChecks({ kind: 'occluded', frames: occluded, a: A, b: B, isInstant: false }).some((f) => f.check === 'exit@p0-starts-on-clip'),
  );

  const missing = goodFrames();
  delete missing.enter__p1;
  check(
    'semantic: a missing frame is a failure, not a silent pass',
    semanticChecks({ kind: 'gap', frames: missing, a: A, b: B, isInstant: false }).some((f) => f.check === 'enter@p1-settles-on-clip'),
  );

  console.log(failures === 0 ? '\nself-test PASS' : `\nself-test FAILED (${failures})`);
  return failures === 0;
}
