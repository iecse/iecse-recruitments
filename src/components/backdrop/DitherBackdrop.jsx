/**
 * Dithered fluid backdrop.
 *
 * The dither pass started as the react-bits Dither background. Everything the
 * field actually does is ours, and it is one idea rather than a stack of
 * effects: the backdrop is a fluid you are pushing around.
 *
 *   1. A velocity and dye field lives in a pair of half float render targets.
 *      Every frame the field is advected through itself (semi-Lagrangian, the
 *      standard cheap advection), decays, and takes a gaussian splat of
 *      momentum wherever the pointer is, scaled by how fast the pointer is
 *      moving. Velocity dies quickly, dye lingers, which is what makes a trail
 *      read as a trail instead of a glow.
 *   2. The wave shader reads that field back: velocity warps the noise lookup
 *      so the pattern genuinely drags, and dye lifts the value so the wake is
 *      brighter than the water.
 *   3. The retro pass quantizes at two pixel grids and mixes per fragment, so
 *      the image is coarse everywhere and sharp near whatever has attention:
 *      the pointer when there is one, otherwise the focused form field. That
 *      keeps a keyboard and a phone in the same experience as a mouse.
 *   4. A `progress` uniform, driven by how much of the application is filled
 *      in, resolves the whole field and warms it from indigo toward brand
 *      blue. The picture comes into focus as the application does.
 *
 * Runs on OGL, not three.js. The three.js build of this same effect was 254 KB
 * gzip once @react-three/fiber and postprocessing were counted, which is why it
 * was desktop only, which meant the audience it was built for never saw it:
 * applicants are on mid range Android phones. The OGL build is around 20 KB,
 * so it ships to everyone and the phone gets the interaction too.
 *
 * There is no React state in here. Props are read through a ref and pointer
 * motion writes straight to uniforms, so nothing in this file ever triggers a
 * render of anything.
 */

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, RenderTarget, Texture, Transform, Triangle, Vec2 } from "ogl";
import { buildSealTexture } from "../../lib/seal";

/* Both passes draw one full screen triangle, so they share a vertex shader.
   OGL's Triangle geometry supplies `position` in clip space and `uv` in 0..1,
   which is why this is shorter than the three.js pair it replaces. */
const vertexShader = `
precision highp float;
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/* -------------------------------------------------------------- fluid pass */

const fluidFragmentShader = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uPrevious;
uniform vec2 uPointer;
uniform vec2 uPointerVelocity;
uniform float uAspect;
uniform float uDelta;
uniform float uRadius;
uniform float uForce;
uniform float uVelocityDecay;
uniform float uDyeDecay;
uniform vec2 uImpulse;
uniform float uImpulseStrength;
uniform float uPointerActive;

void main() {
  vec2 previousVelocity = texture2D(uPrevious, vUv).rg;

  // Semi-Lagrangian advection: look back along the velocity and take what was
  // there. No pressure solve, because an incompressible field is not what this
  // needs to look right, and the solve is where the frame budget goes.
  vec2 source = vUv - previousVelocity * uDelta;
  vec4 carried = texture2D(uPrevious, source);

  vec2 velocity = carried.rg;
  float dye = carried.b;

  vec2 offset = (vUv - uPointer) * vec2(uAspect, 1.0);
  float splat = exp(-dot(offset, offset) / uRadius);

  // Gated on the pointer being live. Unconditional injection meant a cursor
  // parked anywhere on the page kept pumping ink in forever, and the field
  // drifted off the brand ramp into a washed out mauve within a minute. It
  // also matters more now than it did: a phone has no resting cursor at all.
  velocity += uPointerVelocity * splat * uForce * uDelta * uPointerActive;
  dye += splat * uDelta * 9.0 * uPointerActive;

  // Shockwave. Fired when the applicant clears a step, pushing outward from
  // the button they just pressed, so progress is something you feel in the
  // field and not just a bar that moves.
  if (uImpulseStrength > 0.001) {
    vec2 toward = (vUv - uImpulse) * vec2(uAspect, 1.0);
    float distance = length(toward) + 1e-5;
    float ring = exp(-distance * distance / (uRadius * 9.0));
    velocity += (toward / distance) * ring * uImpulseStrength * uDelta * 26.0;
    dye += ring * uImpulseStrength * uDelta * 14.0;
  }

  // Frame rate independent decay, so a 144Hz screen does not damp four times
  // faster than a 30Hz one.
  velocity *= pow(uVelocityDecay, uDelta * 60.0);
  dye *= pow(uDyeDecay, uDelta * 60.0);

  gl_FragColor = vec4(velocity, clamp(dye, 0.0, 2.6), 1.0);
}
`;

/* --------------------------------------------------------------- wave pass */

const waveFragmentShader = `
precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform vec3 waveColor;
uniform vec3 dyeColor;
uniform sampler2D fluidField;
uniform float fluidDrag;
uniform sampler2D sealField;
uniform float sealScale;
uniform float sealMix;

vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

const int OCTAVES = 4;
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = waveFrequency;
  for (int i = 0; i < OCTAVES; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= waveAmplitude;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - time * waveSpeed;
  return fbm(p + fbm(p2));
}

void main() {
  vec2 screenUv = gl_FragCoord.xy / resolution.xy;
  vec4 fluid = texture2D(fluidField, screenUv);
  float aspect = resolution.x / resolution.y;

  vec2 uv = screenUv - 0.5;
  uv.x *= aspect;

  // Velocity drags the noise lookup, so the medium itself moves with the
  // stroke rather than a brightness mask sliding over a static field.
  uv -= fluid.rg * fluidDrag;

  float f = pattern(uv);

  // The applicant's own mark, blown up to fill the viewport. The fluid warps
  // where it is sampled, so stirring the field distorts the mark rather than
  // sliding a highlight across it.
  vec2 markUv = (screenUv - 0.5) * vec2(aspect, 1.0) / sealScale;
  markUv -= fluid.rg * fluidDrag * 1.4;
  markUv += 0.5;
  float mark = 0.0;
  if (markUv.x > 0.0 && markUv.x < 1.0 && markUv.y > 0.0 && markUv.y < 1.0) {
    mark = texture2D(sealField, markUv).r;
  }

  // Noise is the developer bath, the mark is the latent image. sealMix rises
  // with application progress, so the picture comes up as the form fills.
  //
  // The ambient floor was 0.06, which the retro pass then crushed to nothing:
  // 0.06 of the deep blue is 0.04 on its strongest channel, and quantize()
  // subtracts a bias larger than that before it steps. Whole regions came out
  // dead black, so a pointer crossing them had no field left to disturb. 0.15
  // clears the bias on the dither's upper thresholds and not its lower ones,
  // which is what makes a sparse floor rather than a grey wash.
  float value = 0.15 + f * (0.27 + (1.0 - sealMix) * 0.32) + mark * sealMix * (0.72 + f * 0.55);

  // The wake is a blend toward the hot end of the same ramp, and nothing is
  // added on top. The old additive term let dye push the result past 1.0, and
  // channels clipped at different points, so a strong wake turned magenta and
  // then white instead of staying on the club's two colours.
  vec3 col = mix(vec3(0.0), waveColor, value);
  float wake = clamp(fluid.b * 0.6, 0.0, 1.0);
  col = mix(col, dyeColor, wake * 0.9);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* -------------------------------------------------------------- retro pass */

/* `resolution` and `inputBuffer` used to be injected by postprocessing. On OGL
   this is an ordinary program, so it declares them itself. */
const ditherFragmentShader = `
precision highp float;
uniform float colorNum;
uniform float pixelSizeFine;
uniform float pixelSizeCoarse;
uniform vec2 focusCenter;
uniform float focusRadius;
uniform float focusStrength;
uniform float progress;
uniform vec2 resolution;

/* Subtracted before stepping. It is what keeps the field sparse and saturated
   instead of a grey wash.
   Weighted per channel rather than flat. A flat bias low enough to keep the
   dark blue floor alive also let red round up to a whole step on its own, and
   a cell with red and blue lit but no green is purple: a third hue the club
   does not have. Red is crushed hardest, green sits in the middle for the cyan
   end of the ramp, blue is barely touched so the floor survives. */
const vec3 BIAS = vec3(0.26, 0.13, 0.07);
uniform sampler2D inputBuffer;
varying vec2 vUv;

/* The 8x8 Bayer threshold, computed rather than looked up.
   postprocessing compiled its passes as GLSL ES 3.00, where a const array
   initialiser and a dynamic index are both legal. These programs are ES 1.00,
   where neither is, so this uses the standard recursive form instead. Same
   matrix, no array, and no dependent read on the mobile GPUs this now runs on. */
float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))

vec3 quantize(vec2 uv, vec3 color, float pixelSize) {
  vec2 scaledCoord = floor(uv * resolution / pixelSize);
  float threshold = bayer8(scaledCoord) - 0.25;
  float stepSize = 1.0 / (colorNum - 1.0);
  color += threshold * stepSize;
  color = clamp(color - BIAS, 0.0, 1.0);
  return floor(color * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}

vec3 sampleAtGrid(vec2 uv, float pixelSize) {
  vec2 normalizedPixelSize = pixelSize / resolution;
  vec2 uvPixel = normalizedPixelSize * floor(uv / normalizedPixelSize);
  vec3 color = texture2D(inputBuffer, uvPixel).rgb;
  return quantize(uv, color, pixelSize);
}

void main() {
  vec2 uv = vUv;
  float aspect = resolution.x / resolution.y;
  vec2 delta = (uv - focusCenter) * vec2(aspect, 1.0);
  float local = 1.0 - smoothstep(0.0, focusRadius, length(delta));

  float focus = clamp(progress + local * focusStrength, 0.0, 1.0);

  vec3 coarse = sampleAtGrid(uv, pixelSizeCoarse);
  vec3 fine = sampleAtGrid(uv, pixelSizeFine);

  gl_FragColor = vec4(mix(coarse, fine, focus), 1.0);
}
`;

/* ------------------------------------------------------------------ field */

/* The club's own three gradient stops, lifted into a range the dither can
   actually step through. A field whose brightest tone is near black cannot be
   noticeable no matter how hard the pointer pushes it.
   deep blue #1F44A6 -> cyan #23C8D3, and the wake is a hotter cyan again. */
const COLOR_START = [0.11, 0.26, 0.68];
const COLOR_END = [0.13, 0.69, 0.78];
/* The wake, as a hotter cyan rather than a third hue. Violet was the wake
   before, and additively it climbed out of the ramp into magenta and near
   white, which read as a rainbow rather than as the club's two colours. Every
   pixel of the field now sits on the deep blue to cyan line. Violet stays where
   it belongs, on the interface: the interview chip and the selection colour. */
const DYE_COLOR = [0.32, 0.9, 1.0];

const FOCUSABLE = "input, select, textarea, button, a[href], [tabindex]";

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Phones get a smaller simulation, a coarser grid and a wider splat, because a
 * fingertip is a blunter instrument than a cursor and a mid range GPU has a
 * smaller budget. Same effect, fewer pixels of work.
 */
const COMPACT = {
  fine: 5,
  coarse: 13,
  colorNumStart: 3,
  colorNumEnd: 4,
  focusRadius: 0.34,
  focusStrength: 0.5,
  simSize: 128,
  splatRadius: 0.05,
  splatForce: 0.9,
  drag: 0.55,
  sealScale: 1.5,
  maxDpr: 1,
};

const FULL = {
  fine: 4,
  coarse: 16,
  colorNumStart: 3.4,
  colorNumEnd: 5.5,
  focusRadius: 0.26,
  focusStrength: 0.9,
  simSize: 256,
  splatRadius: 0.03,
  splatForce: 1.25,
  drag: 0.8,
  sealScale: 1.15,
  maxDpr: 1,
};

/**
 * Half float colour targets are what the velocity field needs: velocity is
 * signed and dye runs past 1, so an unsigned byte target would clip both. In
 * WebGL2 that needs EXT_color_buffer_float to be renderable. Without it there
 * is no cheap fallback worth having, so the caller shows the static field.
 */
function fluidTargetOptions(gl, size) {
  return {
    width: size,
    height: size,
    type: gl.HALF_FLOAT,
    format: gl.RGBA,
    internalFormat: gl.RGBA16F,
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR,
    depth: false,
    stencil: false,
  };
}

export default function DitherBackdrop({
  progress = 0,
  animate = true,
  interactive = true,
  compact = false,
  seed = "iecse",
  onUnsupported,
}) {
  const holderRef = useRef(null);

  /* Props are read inside the render loop, never depended on by it. Changing
     progress on every keystroke must not tear down a GPU context. Synced in an
     effect rather than during render, which is not a safe place to write refs.
     Declared before the setup effect so it has run by the time that mounts. */
  const props = useRef({ progress, animate, interactive, seed, onUnsupported });
  useEffect(() => {
    props.current = { progress, animate, interactive, seed, onUnsupported };
  }, [progress, animate, interactive, seed, onUnsupported]);

  /* Set by the setup effect so the seed effect can reach the live texture. */
  const gpu = useRef(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return undefined;

    // The canvas is built here rather than rendered by React, because teardown
    // ends with loseContext() and a lost context sticks to the element: every
    // later getContext on it returns the same dead one. Reusing a React owned
    // canvas meant the second mount saw no float targets and fell back for
    // good. A fresh element per mount cannot inherit that.
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;display:block";
    holder.appendChild(canvas);

    const quality = compact ? COMPACT : FULL;

    let renderer;
    try {
      renderer = new Renderer({
        canvas,
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
        dpr: Math.min(window.devicePixelRatio || 1, quality.maxDpr),
      });
    } catch {
      canvas.remove();
      props.current.onUnsupported?.();
      return undefined;
    }

    const gl = renderer.gl;

    // WebGL1 has no RGBA16F, and WebGL2 without this extension cannot render to
    // one. Either way the simulation cannot run, so hand back to the caller.
    if (!renderer.isWebgl2 || !gl.getExtension("EXT_color_buffer_float")) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
      props.current.onUnsupported?.();
      return undefined;
    }

    gl.clearColor(0, 0, 0, 1);

    const geometry = new Triangle(gl);

    /* ---- the simulation, in a pair of targets we swap between ---- */

    let fluidRead = new RenderTarget(gl, fluidTargetOptions(gl, quality.simSize));
    let fluidWrite = new RenderTarget(gl, fluidTargetOptions(gl, quality.simSize));

    const fluidProgram = new Program(gl, {
      vertex: vertexShader,
      fragment: fluidFragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrevious: { value: fluidRead.texture },
        uPointer: { value: new Vec2(0.5, 0.5) },
        uPointerVelocity: { value: new Vec2(0, 0) },
        uAspect: { value: 1 },
        uDelta: { value: 0.016 },
        uRadius: { value: quality.splatRadius },
        uForce: { value: quality.splatForce },
        uVelocityDecay: { value: 0.975 },
        uDyeDecay: { value: 0.9975 },
        uImpulse: { value: new Vec2(0.5, 0.5) },
        uImpulseStrength: { value: 0 },
        uPointerActive: { value: 0 },
      },
    });
    const fluidMesh = new Mesh(gl, { geometry, program: fluidProgram });

    // A fresh render target holds whatever was in that GPU memory. The first
    // frame samples uPrevious before anything has written to it and the
    // simulation feeds its own output back in, so garbage on frame one is
    // garbage forever: the dye channel saturates and the field blows out to
    // white. three.js zeroed its targets on creation; this has to say so.
    // Rendering an empty scene is OGL's own bind-and-clear path, which is the
    // part worth trusting here rather than driving the framebuffer by hand.
    const blank = new Transform();
    renderer.render({ scene: blank, target: fluidRead });
    renderer.render({ scene: blank, target: fluidWrite });

    /* ---- the wave, rendered off screen so the retro pass can read it ---- */

    const waveTarget = new RenderTarget(gl, {
      width: 1,
      height: 1,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      depth: false,
      stencil: false,
    });

    const sealSource = buildSealTexture(props.current.seed);
    const sealTexture = new Texture(gl, {
      image: sealSource.data,
      width: sealSource.size,
      height: sealSource.size,
      // Nearest keeps the cells hard edged, which is the whole point: this
      // should read as a giant halftone stamp, not a blurred gradient.
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
      generateMipmaps: false,
      flipY: false,
    });

    const waveProgram = new Program(gl, {
      vertex: vertexShader,
      fragment: waveFragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        resolution: { value: new Vec2(1, 1) },
        time: { value: 0 },
        waveSpeed: { value: 0.075 },
        waveFrequency: { value: 3 },
        waveAmplitude: { value: 0.32 },
        waveColor: { value: [...COLOR_START] },
        dyeColor: { value: [...DYE_COLOR] },
        fluidField: { value: fluidRead.texture },
        fluidDrag: { value: quality.drag },
        sealField: { value: sealTexture },
        sealScale: { value: quality.sealScale },
        sealMix: { value: 0.35 },
      },
    });
    const waveMesh = new Mesh(gl, { geometry, program: waveProgram });

    /* ---- the retro pass, straight to the screen ---- */

    const ditherProgram = new Program(gl, {
      vertex: vertexShader,
      fragment: ditherFragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        inputBuffer: { value: waveTarget.texture },
        resolution: { value: new Vec2(1, 1) },
        colorNum: { value: quality.colorNumStart },
        pixelSizeFine: { value: quality.fine },
        pixelSizeCoarse: { value: quality.coarse },
        focusCenter: { value: new Vec2(0.5, 0.5) },
        focusRadius: { value: quality.focusRadius },
        focusStrength: { value: quality.focusStrength },
        progress: { value: 0 },
      },
    });
    const ditherMesh = new Mesh(gl, { geometry, program: ditherProgram });

    gpu.current = { sealTexture };

    /* ---- sizing ---- */

    const resize = () => {
      const width = holder.clientWidth || 1;
      const height = holder.clientHeight || 1;
      renderer.setSize(width, height);
      const bufferWidth = gl.drawingBufferWidth;
      const bufferHeight = gl.drawingBufferHeight;
      waveTarget.setSize(bufferWidth, bufferHeight);
      waveProgram.uniforms.resolution.value.set(bufferWidth, bufferHeight);
      ditherProgram.uniforms.resolution.value.set(bufferWidth, bufferHeight);
      ditherProgram.uniforms.inputBuffer.value = waveTarget.texture;
      fluidProgram.uniforms.uAspect.value = width / Math.max(height, 1);
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(holder);

    /* ---- input ---- */

    const pointer = {
      uv: new Vec2(0.5, 0.5),
      previous: new Vec2(0.5, 0.5),
      velocity: new Vec2(0, 0),
      moved: false,
      activeUntil: 0,
    };

    const anchor = new Vec2(0.5, 0.5);
    let focusedEl = null;
    let sampleAt = 0;

    const toUv = (clientX, clientY) => [
      clientX / Math.max(window.innerWidth, 1),
      1 - clientY / Math.max(window.innerHeight, 1),
    ];

    // pointermove covers mouse, pen and touch drags in one listener, which is
    // the whole reason a phone gets this at all.
    const onMove = (event) => {
      if (!props.current.interactive) return;
      const [x, y] = toUv(event.clientX, event.clientY);
      pointer.uv.set(x, y);
      pointer.moved = true;
    };

    // A finger cannot hover, so a tap is the phone's version of arriving. It
    // drops a ripple where the applicant touched instead of nothing at all.
    const onDown = (event) => {
      if (!props.current.interactive) return;
      const [x, y] = toUv(event.clientX, event.clientY);
      pointer.uv.set(x, y);
      pointer.previous.set(x, y);
      fluidProgram.uniforms.uImpulse.value.set(x, y);
      // A tap is one ripple. It deliberately does not open the splat window:
      // a finger that lands and stops should leave a wake and nothing more.
      fluidProgram.uniforms.uImpulseStrength.value = 0.7;
    };

    /* Impulses arrive as events so any component can fire one without this
       component needing to know the form exists. */
    const onImpulse = (event) => {
      const { x, y } = event.detail || {};
      if (typeof x !== "number" || typeof y !== "number") return;
      const [u, v] = toUv(x, y);
      fluidProgram.uniforms.uImpulse.value.set(u, v);
      fluidProgram.uniforms.uImpulseStrength.value = 1;
    };

    /* Focus: the fallback anchor for keyboards. */
    const onFocusIn = (event) => {
      focusedEl = event.target?.matches?.(FOCUSABLE) ? event.target : null;
      sampleAt = 0;
    };
    const onFocusOut = () => {
      focusedEl = null;
    };

    // A cheap Android under memory pressure can have its context taken away
    // mid session. Say so and let the caller swap in the static field, rather
    // than leaving a canvas that has quietly stopped painting.
    const onContextLost = (event) => {
      event.preventDefault();
      props.current.onUnsupported?.();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    // Once a drag turns into a scroll the browser fires pointercancel and the
    // pointermove stream stops, so on a phone the field would go inert exactly
    // when the applicant is moving. touchmove keeps arriving through a scroll.
    const onTouchMove = (event) => {
      const touch = event.touches && event.touches[0];
      if (!touch) return;
      onMove(touch);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("iecse:impulse", onImpulse);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    /* ---- run only while it is on screen and the tab is in front ---- */

    let onScreen = true;
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    visibilityObserver.observe(holder);

    /* ---- loop ---- */

    let frame = 0;
    let last = performance.now();
    let elapsed = 0;
    let mountedAt = null;
    let introFired = false;
    let smoothedProgress = 0;
    let smoothedFocus = 0;

    const draw = (now) => {
      frame = requestAnimationFrame(draw);

      const rawDelta = (now - last) / 1000;
      last = now;
      // Off screen or in a background tab is the common case on a phone, where
      // the field scrolls away in one swipe. Not drawing is the whole saving.
      if (document.hidden || !onScreen) return;

      const delta = Math.min(Math.max(rawDelta, 0.0001), 1 / 30);
      const { progress: target, animate: running, interactive: live } =
        props.current;

      if (running) elapsed += delta;
      const time = elapsed;

      // Opening reveal. The field arrives fully coarse and undeveloped, then
      // resolves into its resting state, with one bloom pushed out of the
      // centre so the fluid announces itself before anyone touches it.
      if (mountedAt === null) mountedAt = time;
      const introRaw = running ? Math.min(1, (time - mountedAt) / 1.6) : 1;
      const intro = 1 - Math.pow(1 - introRaw, 3);

      /* ---- fluid step ---- */
      if (pointer.moved) {
        pointer.velocity.set(
          (pointer.uv.x - pointer.previous.x) / Math.max(delta, 0.001),
          (pointer.uv.y - pointer.previous.y) / Math.max(delta, 0.001)
        );
        pointer.previous.copy(pointer.uv);
        pointer.moved = false;
        // Any movement counts. The old threshold ignored slow travel, so
        // easing the cursor into place left the field inert.
        pointer.activeUntil = time + 1.4;
      } else {
        pointer.velocity.multiply(0.86);
      }

      const pointerLive = live && time < pointer.activeUntil;

      if (running) {
        const fu = fluidProgram.uniforms;
        // Presence with a floor, not speed alone. Scaling purely by speed meant
        // a cursor moved slowly onto a spot injected almost nothing and the
        // field did not answer, which reads as a dead patch. The floor makes it
        // respond wherever the pointer is; the idle window is what stops a
        // parked cursor pumping dye in forever and drifting off the ramp.
        const speed = Math.hypot(pointer.velocity.x, pointer.velocity.y);
        fu.uPointerActive.value = pointerLive
          ? Math.min(1, 0.45 + speed * 0.7)
          : 0;
        fu.uPrevious.value = fluidRead.texture;
        fu.uPointer.value.copy(pointer.uv);
        fu.uPointerVelocity.value.copy(pointer.velocity);
        fu.uDelta.value = delta;

        if (!introFired && time - mountedAt > 0.25) {
          introFired = true;
          fu.uImpulse.value.set(0.5, 0.5);
          fu.uImpulseStrength.value = 1.6;
        }

        // Short, hard decay: a shockwave is an event, not a state.
        fu.uImpulseStrength.value *= Math.pow(0.02, delta);
        if (fu.uImpulseStrength.value < 0.002) fu.uImpulseStrength.value = 0;

        renderer.render({ scene: fluidMesh, target: fluidWrite });

        const swap = fluidRead;
        fluidRead = fluidWrite;
        fluidWrite = swap;
      }

      /* ---- resolve dials ---- */
      const k = Math.min(1, delta * 2.2);
      smoothedProgress = lerp(smoothedProgress, target, k);
      const resolved = smoothedProgress;

      const wu = waveProgram.uniforms;
      wu.fluidField.value = fluidRead.texture;
      wu.time.value = time;
      wu.waveColor.value[0] = lerp(COLOR_START[0], COLOR_END[0], resolved);
      wu.waveColor.value[1] = lerp(COLOR_START[1], COLOR_END[1], resolved);
      wu.waveColor.value[2] = lerp(COLOR_START[2], COLOR_END[2], resolved);
      wu.waveAmplitude.value = lerp(0.42, 0.55, resolved);
      // Latent at the start, fully developed by submission.
      wu.sealMix.value = lerp(0.3, 1, resolved) * intro;
      wu.waveSpeed.value = running ? lerp(0.05, 0.075, resolved) : 0;

      const focusLive = Boolean(focusedEl && focusedEl.isConnected);

      if (pointerLive) {
        anchor.lerp(pointer.uv, Math.min(1, delta * 12));
      } else if (focusLive && time - sampleAt > 0.08) {
        // Sampled on an interval, never per frame: reading a rect forces layout.
        sampleAt = time;
        const rect = focusedEl.getBoundingClientRect();
        anchor.set(
          (rect.left + rect.width / 2) / Math.max(window.innerWidth, 1),
          1 - (rect.top + rect.height / 2) / Math.max(window.innerHeight, 1)
        );
      }

      smoothedFocus = lerp(smoothedFocus, pointerLive || focusLive ? 1 : 0, k);

      const du = ditherProgram.uniforms;
      du.progress.value = resolved;
      du.colorNum.value = lerp(
        quality.colorNumStart,
        quality.colorNumEnd,
        resolved
      );
      // Chunky on arrival, settling to the working grid as the intro plays.
      du.pixelSizeCoarse.value =
        lerp(quality.coarse, quality.coarse * 0.72, resolved) *
        lerp(2.4, 1, intro);
      du.focusStrength.value = smoothedFocus * quality.focusStrength;
      du.focusCenter.value.lerp(anchor, k);

      renderer.render({ scene: waveMesh, target: waveTarget });
      renderer.render({ scene: ditherMesh });
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("iecse:impulse", onImpulse);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);

      canvas.removeEventListener("webglcontextlost", onContextLost);

      gpu.current = null;
      // Browsers cap how many live contexts a page may hold, so this releases
      // the whole thing rather than leaving it for the garbage collector. Safe
      // because the element goes with it.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [compact]);

  /* The mark is regenerated only when the registration number changes, and it
     swaps the texture in place rather than rebuilding the field around it. */
  useEffect(() => {
    const live = gpu.current;
    if (!live) return;
    const { data, size } = buildSealTexture(seed);
    live.sealTexture.image = data;
    live.sealTexture.width = size;
    live.sealTexture.height = size;
    live.sealTexture.needsUpdate = true;
  }, [seed]);

  return <div ref={holderRef} className="absolute inset-0" />;
}
