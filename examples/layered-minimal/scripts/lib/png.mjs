// A minimal, dependency-free PNG decoder.
//
// The pixel harness needs actual PIXELS, not just file bytes: its semantic
// assertions ("at progress 0 the composite shows the OUTGOING clip") are
// statements about colour, and its golden hashes are taken over the decoded
// RGBA buffer rather than the PNG file so that a change in the encoder (a
// Chromium bump re-tuning zlib, say) is not reported as a rendering change.
//
// Node ships zlib, so the only real work is chunk parsing and un-filtering.
// Scope is deliberately narrow — exactly what Chromium's still capture emits
// (8-bit, non-interlaced) — and anything else throws loudly rather than
// decoding subtly wrong.
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Bytes per pixel, by PNG colour type. Indexed (3) is unsupported on purpose. */
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG buffer to `{ width, height, data }` where `data` is RGBA,
 * 4 bytes per pixel, row-major.
 */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');

  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat = [];

  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth}`);
      if (!(colorType in CHANNELS)) throw new Error(`unsupported PNG colour type ${colorType}`);
      if (body[12] !== 0) throw new Error('interlaced PNG is unsupported');
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (!width || !height) throw new Error('PNG has no IHDR');

  const chans = CHANNELS[colorType];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * chans;
  if (raw.length < height * (stride + 1)) throw new Error('truncated PNG data');

  // Un-filter in place into a contiguous scanline buffer, then expand to RGBA.
  const lines = Buffer.allocUnsafe(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= chans ? lines[dst + x - chans] : 0;
      const b = y > 0 ? lines[up + x] : 0;
      const c = x >= chans && y > 0 ? lines[up + x - chans] : 0;
      const v = raw[src + x];
      let out;
      if (filter === 0) out = v;
      else if (filter === 1) out = v + a;
      else if (filter === 2) out = v + b;
      else if (filter === 3) out = v + ((a + b) >> 1);
      else if (filter === 4) out = v + paeth(a, b, c);
      else throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      lines[dst + x] = out & 0xff;
    }
  }

  const data = Buffer.allocUnsafe(width * height * 4);
  for (let i = 0, px = 0; px < width * height; px++) {
    const s = px * chans;
    let r;
    let g;
    let b;
    let a = 255;
    if (colorType === 0) {
      r = g = b = lines[s];
    } else if (colorType === 4) {
      r = g = b = lines[s];
      a = lines[s + 1];
    } else if (colorType === 2) {
      r = lines[s];
      g = lines[s + 1];
      b = lines[s + 2];
    } else {
      r = lines[s];
      g = lines[s + 1];
      b = lines[s + 2];
      a = lines[s + 3];
    }
    data[i++] = r;
    data[i++] = g;
    data[i++] = b;
    data[i++] = a;
  }
  return { width, height, data };
}
