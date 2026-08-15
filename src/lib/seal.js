import { LOGO_GRID, buildLogoCoverage } from "./logoMark.js";

/**
 * Deterministic applicant seal.
 *
 * A registration number maps to exactly one mark, every time, on every device,
 * with no storage and no network. Same number, same seal. Different number,
 * different seal. Nothing here is random at runtime.
 */

/** FNV-1a, 32 bit. Stable across engines, unlike anything based on hashCode. */
function hashString(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32: small, fast, good enough distribution for a visual seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEAL_GRID = 11;

/**
 * Builds a vertically symmetric halftone grid. Symmetry is what makes the
 * result read as a mark rather than as noise.
 *
 * @returns {{cells: Array<{x:number,y:number,v:number}>, seed:number}}
 */
export function buildSeal(registration) {
  const key = String(registration || "").trim() || "iecse";
  const seed = hashString(key);
  const random = mulberry32(seed);

  const half = Math.ceil(SEAL_GRID / 2);
  const cells = [];

  // Bias density toward the middle rows so the mark has a visual centre.
  for (let y = 0; y < SEAL_GRID; y += 1) {
    const rowWeight =
      1 - Math.abs(y - (SEAL_GRID - 1) / 2) / ((SEAL_GRID - 1) / 2);

    for (let x = 0; x < half; x += 1) {
      const raw = random();
      const v = raw * (0.45 + rowWeight * 0.55);
      if (v < 0.24) continue;

      cells.push({ x, y, v });
      const mirrored = SEAL_GRID - 1 - x;
      if (mirrored !== x) cells.push({ x: mirrored, y, v });
    }
  }

  return { cells, seed };
}

/**
 * The same mark as an RGBA byte buffer, ready to become a GPU texture.
 * Kept in this file so the seal in the corner and the seal filling the screen
 * can never drift apart: one generator, two renderers.
 *
 * RGBA/UnsignedByte rather than a single float channel, because float texture
 * formats are not uniformly filterable across drivers and this needs to work
 * on whatever phone an applicant happens to own.
 */
export function buildSealTexture(registration) {
  const coverage = buildLogoCoverage();
  const size = LOGO_GRID;
  const data = new Uint8Array(size * size * 4);

  // The shape is the club's S. What the applicant's number decides is the
  // grain inside it, not the outline: the field used to resolve into an
  // 11x11 procedural halftone, which is unique per applicant and reads as
  // noise, because a random arrangement of squares looks like exactly that.
  // Resolving into the mark means the picture that comes up is recognisably
  // the club, and the number still makes it theirs.
  const random = mulberry32(hashString(String(registration || "").trim() || "iecse"));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cover = coverage[y * size + x];
      // Flip y: texture space runs bottom up, the grid is authored top down.
      const index = ((size - 1 - y) * size + x) * 4;

      // Grain never drops a cell far enough to bite a hole in the glyph, and
      // never lifts one outside it. The S stays the S at every seed.
      const grain = 0.72 + random() * 0.28;
      const level = Math.round(Math.min(1, cover * grain) * 255);

      data[index] = level;
      data[index + 1] = level;
      data[index + 2] = level;
      data[index + 3] = 255;
    }
  }

  return { data, size };
}
