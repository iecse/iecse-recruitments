import { useEffect, useRef } from "react";
import { SEAL_GRID, buildSeal } from "../../lib/seal";

/**
 * The dithered field, drawn once to a 2D canvas.
 *
 * Phones do not get the WebGL version: 257 KB gzip of three.js is not a fair
 * trade for a decorative background on campus wifi. But they should not get a
 * flat gradient either, so this reproduces the same look with nothing but the
 * canvas API already in the browser.
 *
 * Same inputs as the shader, so the two read as one design: the applicant's
 * seal, an 8x8 bayer threshold, and the deep blue to cyan ramp. The only thing
 * missing is motion, which is the part a phone was never going to get anyway.
 *
 * Rendered at a fraction of the display size and scaled up with
 * `image-rendering: pixelated`, which is what produces the chunky cells. That
 * also means the whole thing is a few thousand pixels of work, once.
 */

/* Same matrix the retro pass uses. */
const BAYER = [
  0, 48, 12, 60, 3, 51, 15, 63, 32, 16, 44, 28, 35, 19, 47, 31, 8, 56, 4, 52,
  11, 59, 7, 55, 40, 24, 36, 20, 43, 27, 39, 23, 2, 50, 14, 62, 1, 49, 13, 61,
  34, 18, 46, 30, 33, 17, 45, 29, 10, 58, 6, 54, 9, 57, 5, 53, 42, 26, 38, 22,
  41, 25, 37, 21,
].map((value) => value / 64);

/* Deep blue to cyan, the same ramp as the shader. */
const FROM = [0.11, 0.26, 0.68];
const TO = [0.13, 0.69, 0.78];
const LEVELS = 4;

/**
 * Pixel size of one dither cell on screen. Matched to the shader's resting
 * coarse grid (quality.coarse = 16) rather than picked by eye: a finer grid
 * reads as noise, and the spacing is most of what makes the field feel like
 * the desktop one.
 */
const CELL = 15;

function drawField(canvas, seed, cssWidth, cssHeight) {
  const width = Math.max(1, Math.ceil(cssWidth / CELL));
  const height = Math.max(1, Math.ceil(cssHeight / CELL));

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  /* The seal, as a lookup grid. */
  const mark = new Float32Array(SEAL_GRID * SEAL_GRID);
  buildSeal(seed).cells.forEach(({ x, y, v }) => {
    mark[y * SEAL_GRID + x] = Math.min(1, 0.35 + v * 0.75);
  });

  const image = ctx.createImageData(width, height);
  const aspect = width / height;
  const step = 1 / (LEVELS - 1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const v = y / height;

      /* The mark, centred and scaled to bleed past the edges. */
      const markX = (u - 0.5) * aspect * 1.6 + 0.5;
      const markY = v * 1.6 - 0.3;
      let value = 0;
      if (markX >= 0 && markX < 1 && markY >= 0 && markY < 1) {
        const cell =
          Math.floor(markY * SEAL_GRID) * SEAL_GRID +
          Math.floor(markX * SEAL_GRID);
        value = mark[cell] * 0.8;
      }

      /* A soft diagonal wash so the frame is not empty where the mark is not. */
      const wash = 1 - Math.min(1, Math.hypot(u - 0.25, v - 0.15) * 1.15);
      // Ambient matched to the shader floor (0.06). Brighter than that and the
      // field stops reading as deep water with a mark in it.
      value += Math.max(0, wash) * 0.44 + 0.07;

      /* Bayer threshold, then quantise: this is what makes it read as dither. */
      const threshold = BAYER[(y % 8) * 8 + (x % 8)] - 0.5;
      const shaded = Math.max(0, Math.min(1, value + threshold * step));
      const level = Math.round(shaded * (LEVELS - 1)) / (LEVELS - 1);

      const index = (y * width + x) * 4;
      image.data[index] = (FROM[0] + (TO[0] - FROM[0]) * level) * level * 255;
      image.data[index + 1] = (FROM[1] + (TO[1] - FROM[1]) * level) * level * 255;
      image.data[index + 2] = (FROM[2] + (TO[2] - FROM[2]) * level) * level * 255;
      image.data[index + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
}

export default function StaticDither({ seed = "iecse" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const paint = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const { width, height } = parent.getBoundingClientRect();
      if (width > 0 && height > 0) drawField(canvas, seed, width, height);
    };

    paint();

    /* Repaint on resize only, not on scroll: on a phone the address bar
       collapsing changes the height and would otherwise leave a stretched
       image. Throttled to the trailing edge. */
    let timer = 0;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(paint, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [seed]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
