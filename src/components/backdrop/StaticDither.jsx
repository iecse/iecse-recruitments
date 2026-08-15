import { useEffect, useRef } from "react";
import { LOGO_GRID, buildLogoCoverage } from "../../lib/logoMark";

/**
 * The dithered field, drawn once to a 2D canvas.
 *
 * Phones do get the WebGL version now that it runs on OGL. This is the
 * fallback for the cases that still cannot: reduced motion, no WebGL2, no
 * float render targets, or a context the driver took back. It reproduces the
 * same look with nothing but the canvas API already in the browser, so those
 * applicants see the same field, only still.
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

/* The shader ramp, and the same constants its retro pass uses. */
const WAVE = [0.11, 0.26, 0.68];
const COLOR_NUM = 3.4;
/* Matches the retro pass, per channel. A flat bias low enough to keep the dark
   blue floor alive also let red round up on its own, and red plus blue with no
   green is purple: a hue the club does not have. Red crushed hardest, blue
   barely touched so the floor survives. */
const BIAS = [0.26, 0.13, 0.07];

/**
 * Pixel size of one dither cell on screen, matched to the shader resting grid
 * (quality.coarse = 16). A finer grid reads as noise.
 */
const CELL = 15;

/** Cheap deterministic value noise, standing in for the shader FBM. */
function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function drawField(canvas, seed, cssWidth, cssHeight) {
  const width = Math.max(1, Math.ceil(cssWidth / CELL));
  const height = Math.max(1, Math.ceil(cssHeight / CELL));

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // The same mark the shader resolves into, so the still version and the live
  // one are the same picture. The seed is unused here: the shape is the club's
  // and the per applicant grain is not worth a second code path on a fallback
  // that is on screen for a moment.
  const mark = buildLogoCoverage();

  const image = ctx.createImageData(width, height);
  const aspect = width / height;
  const stepSize = 1 / (COLOR_NUM - 1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const v = y / height;

      const markX = (u - 0.5) * aspect * 1.6 + 0.5;
      const markY = v * 1.6 - 0.3;
      let value = 0;
      if (markX >= 0 && markX < 1 && markY >= 0 && markY < 1) {
        const cell =
          Math.floor(markY * LOGO_GRID) * LOGO_GRID +
          Math.floor(markX * LOGO_GRID);
        value = mark[cell] * 0.72;
      }

      /* Two octaves of value noise, the cheap stand-in for the shader FBM. */
      const noise =
        valueNoise(u * 5 * aspect, v * 5) * 0.6 +
        valueNoise(u * 11 * aspect, v * 11) * 0.4;

      value += 0.13 + noise * 0.44;

      /*
       * The shader quantises per channel, after subtracting a bias. That bias
       * is what makes the field sparse: on a blue dominant colour it crushes
       * red and green to zero and lets blue snap to a whole step, which is why
       * the dots read as isolated and saturated rather than as a grey wash.
       * Interpolating a colour and scaling it by brightness cannot reproduce
       * that, so this ports quantize() from the retro pass directly.
       */
      const threshold = BAYER[(y % 8) * 8 + (x % 8)] - 0.25;
      const index = (y * width + x) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        let c = WAVE[channel] * value;
        c += threshold * stepSize;
        c = Math.max(0, Math.min(1, c - BIAS[channel]));
        c = Math.round(c * (COLOR_NUM - 1)) / (COLOR_NUM - 1);
        image.data[index + channel] = Math.min(255, c * 255);
      }
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
