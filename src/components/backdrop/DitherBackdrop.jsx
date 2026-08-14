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
 * Nothing here is React state. Pointer motion writes to refs and uniforms, so
 * dragging across the page never renders a component.
 */

import { useRef, useEffect, useMemo, forwardRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, wrapEffect } from "@react-three/postprocessing";
import { Effect } from "postprocessing";
import * as THREE from "three";
import { buildSealTexture } from "../../lib/seal";

/* -------------------------------------------------------------- fluid pass */

const fullscreenVertexShader = `
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

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

  velocity += uPointerVelocity * splat * uForce * uDelta;
  dye += splat * uDelta * 9.0;

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

const waveVertexShader = `
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;
}
`;

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
  // Small ambient floor: enough that the gaps between mark cells read as deep
  // water rather than dead black, not so much that the whole frame glows.
  float value = 0.06 + f * (0.27 + (1.0 - sealMix) * 0.32) + mark * sealMix * (0.72 + f * 0.55);

  vec3 col = mix(vec3(0.0), waveColor, value);
  col = mix(col, dyeColor, clamp(fluid.b * 0.55, 0.0, 0.85));
  col += dyeColor * fluid.b * 0.45;

  gl_FragColor = vec4(col, 1.0);
}
`;

/* -------------------------------------------------------------- retro pass */

/**
 * `resolution` and `inputBuffer` are injected by postprocessing, so they are
 * deliberately not declared here.
 */
const ditherFragmentShader = `
precision highp float;
uniform float colorNum;
uniform float pixelSizeFine;
uniform float pixelSizeCoarse;
uniform vec2 focusCenter;
uniform float focusRadius;
uniform float focusStrength;
uniform float progress;

const float bayerMatrix8x8[64] = float[64](
  0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0,  3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,
  32.0/64.0,16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0,19.0/64.0, 47.0/64.0, 31.0/64.0,
  8.0/64.0, 56.0/64.0,  4.0/64.0, 52.0/64.0, 11.0/64.0,59.0/64.0,  7.0/64.0, 55.0/64.0,
  40.0/64.0,24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0,27.0/64.0, 39.0/64.0, 23.0/64.0,
  2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0,  1.0/64.0,49.0/64.0, 13.0/64.0, 61.0/64.0,
  34.0/64.0,18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0,17.0/64.0, 45.0/64.0, 29.0/64.0,
  10.0/64.0,58.0/64.0,  6.0/64.0, 54.0/64.0,  9.0/64.0,57.0/64.0,  5.0/64.0, 53.0/64.0,
  42.0/64.0,26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0,25.0/64.0, 37.0/64.0, 21.0/64.0
);

vec3 quantize(vec2 uv, vec3 color, float pixelSize) {
  vec2 scaledCoord = floor(uv * resolution / pixelSize);
  int x = int(mod(scaledCoord.x, 8.0));
  int y = int(mod(scaledCoord.y, 8.0));
  float threshold = bayerMatrix8x8[y * 8 + x] - 0.25;
  float stepSize = 1.0 / (colorNum - 1.0);
  color += threshold * stepSize;
  color = clamp(color - 0.2, 0.0, 1.0);
  return floor(color * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}

vec3 sampleAtGrid(vec2 uv, float pixelSize) {
  vec2 normalizedPixelSize = pixelSize / resolution;
  vec2 uvPixel = normalizedPixelSize * floor(uv / normalizedPixelSize);
  vec3 color = texture2D(inputBuffer, uvPixel).rgb;
  return quantize(uv, color, pixelSize);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float aspect = resolution.x / resolution.y;
  vec2 delta = (uv - focusCenter) * vec2(aspect, 1.0);
  float local = 1.0 - smoothstep(0.0, focusRadius, length(delta));

  float focus = clamp(progress + local * focusStrength, 0.0, 1.0);

  vec3 coarse = sampleAtGrid(uv, pixelSizeCoarse);
  vec3 fine = sampleAtGrid(uv, pixelSizeFine);

  outputColor = vec4(mix(coarse, fine, focus), 1.0);
}
`;

class ResolveEffectImpl extends Effect {
  constructor({
    colorNum = 4,
    pixelSizeFine = 2,
    pixelSizeCoarse = 7,
    focusRadius = 0.24,
    focusStrength = 0.85,
  } = {}) {
    const uniforms = new Map([
      ["colorNum", new THREE.Uniform(colorNum)],
      ["pixelSizeFine", new THREE.Uniform(pixelSizeFine)],
      ["pixelSizeCoarse", new THREE.Uniform(pixelSizeCoarse)],
      ["focusCenter", new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
      ["focusRadius", new THREE.Uniform(focusRadius)],
      ["focusStrength", new THREE.Uniform(focusStrength)],
      ["progress", new THREE.Uniform(0)],
    ]);
    super("ResolveEffect", ditherFragmentShader, { uniforms });
    this.uniforms = uniforms;
  }

  set colorNum(v) {
    this.uniforms.get("colorNum").value = v;
  }
  get colorNum() {
    return this.uniforms.get("colorNum").value;
  }
  set pixelSizeFine(v) {
    this.uniforms.get("pixelSizeFine").value = v;
  }
  get pixelSizeFine() {
    return this.uniforms.get("pixelSizeFine").value;
  }
  set pixelSizeCoarse(v) {
    this.uniforms.get("pixelSizeCoarse").value = v;
  }
  get pixelSizeCoarse() {
    return this.uniforms.get("pixelSizeCoarse").value;
  }
  set focusRadius(v) {
    this.uniforms.get("focusRadius").value = v;
  }
  get focusRadius() {
    return this.uniforms.get("focusRadius").value;
  }
  set focusStrength(v) {
    this.uniforms.get("focusStrength").value = v;
  }
  get focusStrength() {
    return this.uniforms.get("focusStrength").value;
  }
}

const WrappedResolve = wrapEffect(ResolveEffectImpl);

const ResolveEffect = forwardRef((props, ref) => (
  <WrappedResolve ref={ref} {...props} />
));
ResolveEffect.displayName = "ResolveEffect";

/* ------------------------------------------------------------------ field */

/* The club's own three gradient stops, lifted into a range the dither can
   actually step through. A field whose brightest tone is near black cannot be
   noticeable no matter how hard the pointer pushes it.
   deep blue #1F44A6 -> cyan #23C8D3, with violet #886ED2 as the wake. */
const COLOR_START = new THREE.Color(0.11, 0.26, 0.68);
const COLOR_END = new THREE.Color(0.13, 0.69, 0.78);
/* Brand cyan, as the colour of the wake. */
const DYE_COLOR = new THREE.Color(0.53, 0.43, 0.90);

const FOCUSABLE = "input, select, textarea, button, a[href], [tabindex]";
const lerp = (a, b, t) => a + (b - a) * t;

/* eslint-disable react-hooks/immutability -- see note above DitheredField */

/*
 * react-three-fiber drives the GPU by mutating objects in place: the material,
 * the uniform values and the ping-pong render targets are created once and
 * written every frame. React Compiler rules forbid mutating values created
 * during render, which is right for ordinary React and wrong here, because
 * none of these objects are part of React state or its reactive graph.
 *
 * The disable is scoped to this component only, and re-enabled immediately
 * after it, so a stray mutation anywhere else in this file still fails lint.
 *
 * If the React Compiler is ever adopted, the honest fix is to move this
 * simulation into a plain class that React never constructs during render, and
 * reduce this component to a shell that calls step() from useFrame.
 */
function DitheredField({ progress, quality, animate, interactive, seed }) {
  const effectRef = useRef(null);
  const { viewport, size, gl } = useThree();

  const anchor = useRef(new THREE.Vector2(0.5, 0.5));
  const focusedEl = useRef(null);
  const sampleAt = useRef(0);
  const pointerActiveUntil = useRef(0);
  const mountedAt = useRef(null);
  const introFired = useRef(false);
  const smoothedProgress = useRef(0);
  const smoothedFocus = useRef(0);

  const pointer = useRef({
    uv: new THREE.Vector2(0.5, 0.5),
    previous: new THREE.Vector2(0.5, 0.5),
    velocity: new THREE.Vector2(0, 0),
    moved: false,
  });

  /* The simulation lives in its own scene, rendered off screen each frame. */
  const fluid = useMemo(() => {
    const options = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };

    const width = quality.simSize;
    const height = quality.simSize;

    const material = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertexShader,
      fragmentShader: fluidFragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrevious: { value: null },
        uPointer: { value: new THREE.Vector2(0.5, 0.5) },
        uPointerVelocity: { value: new THREE.Vector2(0, 0) },
        uAspect: { value: 1 },
        uDelta: { value: 0.016 },
        uRadius: { value: quality.splatRadius },
        uForce: { value: quality.splatForce },
        uVelocityDecay: { value: 0.975 },
        uDyeDecay: { value: 0.9975 },
        uImpulse: { value: new THREE.Vector2(0.5, 0.5) },
        uImpulseStrength: { value: 0 },
      },
    });

    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    return {
      read: new THREE.WebGLRenderTarget(width, height, options),
      write: new THREE.WebGLRenderTarget(width, height, options),
      camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      scene,
      material,
    };
  }, [quality.simSize, quality.splatRadius, quality.splatForce]);

  useEffect(
    () => () => {
      fluid.read.dispose();
      fluid.write.dispose();
      fluid.material.dispose();
      fluid.scene.traverse((child) => child.geometry?.dispose());
    },
    [fluid]
  );

  const uniforms = useMemo(() => ({
    time: new THREE.Uniform(0),
    resolution: new THREE.Uniform(new THREE.Vector2(0, 0)),
    waveSpeed: new THREE.Uniform(0.075),
    waveFrequency: new THREE.Uniform(3),
    waveAmplitude: new THREE.Uniform(0.32),
    waveColor: new THREE.Uniform(COLOR_START.clone()),
    dyeColor: new THREE.Uniform(DYE_COLOR.clone()),
    fluidField: new THREE.Uniform(null),
    fluidDrag: new THREE.Uniform(quality.drag),
    sealField: new THREE.Uniform(null),
    sealScale: new THREE.Uniform(quality.sealScale),
    sealMix: new THREE.Uniform(0.35),
  }), [quality.drag, quality.sealScale]);

  /* The mark is regenerated only when the registration number changes. */
  const sealTexture = useMemo(() => {
    const { data, size } = buildSealTexture(seed);
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    // Nearest keeps the cells hard edged, which is the whole point: this
    // should read as a giant halftone stamp, not a blurred gradient.
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
  }, [seed]);

  useEffect(() => {
    uniforms.sealField.value = sealTexture;
    return () => sealTexture.dispose();
  }, [sealTexture, uniforms]);

  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const w = Math.floor(size.width * dpr);
    const h = Math.floor(size.height * dpr);
    const res = uniforms.resolution.value;
    if (res.x !== w || res.y !== h) res.set(w, h);
    fluid.material.uniforms.uAspect.value = size.width / Math.max(size.height, 1);
  }, [size, gl, fluid, uniforms]);

  /* Pointer: position and velocity, straight into refs. */
  useEffect(() => {
    if (!interactive) return undefined;

    const onMove = (event) => {
      const x = event.clientX / window.innerWidth;
      const y = 1 - event.clientY / window.innerHeight;
      pointer.current.uv.set(x, y);
      pointer.current.moved = true;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [interactive]);

  /* Impulses arrive as events so any component can fire one without this
     component needing to know the form exists. */
  useEffect(() => {
    const onImpulse = (event) => {
      const { x, y } = event.detail || {};
      if (typeof x !== "number" || typeof y !== "number") return;
      const fm = fluid.material.uniforms;
      fm.uImpulse.value.set(
        x / Math.max(window.innerWidth, 1),
        1 - y / Math.max(window.innerHeight, 1)
      );
      fm.uImpulseStrength.value = 1;
    };

    window.addEventListener("iecse:impulse", onImpulse);
    return () => window.removeEventListener("iecse:impulse", onImpulse);
  }, [fluid]);

  /* Focus: the fallback anchor for keyboards and touch. */
  useEffect(() => {
    const onFocusIn = (event) => {
      focusedEl.current = event.target?.matches?.(FOCUSABLE) ? event.target : null;
      sampleAt.current = 0;
    };
    const onFocusOut = () => {
      focusedEl.current = null;
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    const u = uniforms;
    const now = clock.getElapsedTime();

    // Opening reveal. The field arrives fully coarse and undeveloped, then
    // resolves into its resting state, with one bloom pushed out of the centre
    // so the fluid announces itself before anyone touches it.
    if (mountedAt.current === null) mountedAt.current = now;
    const introRaw = animate ? Math.min(1, (now - mountedAt.current) / 1.6) : 1;
    const intro = 1 - Math.pow(1 - introRaw, 3);
    if (animate) u.time.value = now;

    /* ---- fluid step ---- */
    const p = pointer.current;
    if (p.moved) {
      p.velocity.set(
        (p.uv.x - p.previous.x) / Math.max(delta, 0.001),
        (p.uv.y - p.previous.y) / Math.max(delta, 0.001)
      );
      p.previous.copy(p.uv);
      p.moved = false;
      if (p.velocity.lengthSq() > 0.0004) pointerActiveUntil.current = now + 3.0;
    } else {
      p.velocity.multiplyScalar(0.86);
    }

    if (animate) {
      const fm = fluid.material.uniforms;
      fm.uPrevious.value = fluid.read.texture;
      fm.uPointer.value.copy(p.uv);
      fm.uPointerVelocity.value.copy(p.velocity);
      fm.uDelta.value = delta;

      if (!introFired.current && now - mountedAt.current > 0.25) {
        introFired.current = true;
        fm.uImpulse.value.set(0.5, 0.5);
        fm.uImpulseStrength.value = 1.6;
      }

      // Short, hard decay: a shockwave is an event, not a state.
      fm.uImpulseStrength.value *= Math.pow(0.02, delta);
      if (fm.uImpulseStrength.value < 0.002) fm.uImpulseStrength.value = 0;

      gl.setRenderTarget(fluid.write);
      gl.render(fluid.scene, fluid.camera);
      gl.setRenderTarget(null);

      const swap = fluid.read;
      fluid.read = fluid.write;
      fluid.write = swap;
    }

    u.fluidField.value = fluid.read.texture;

    /* ---- resolve dials ---- */
    const k = Math.min(1, delta * 2.2);
    smoothedProgress.current = lerp(smoothedProgress.current, progress, k);
    const resolved = smoothedProgress.current;

    u.waveColor.value.copy(COLOR_START).lerp(COLOR_END, resolved);
    u.waveAmplitude.value = lerp(0.42, 0.55, resolved);
    // Latent at the start, fully developed by submission.
    u.sealMix.value = lerp(0.3, 1.0, resolved) * intro;
    u.waveSpeed.value = animate ? lerp(0.05, 0.075, resolved) : 0;

    const pointerLive = interactive && now < pointerActiveUntil.current;
    const el = focusedEl.current;
    const focusLive = Boolean(el && el.isConnected);

    if (pointerLive) {
      anchor.current.lerp(p.uv, Math.min(1, delta * 12));
    } else if (focusLive && now - sampleAt.current > 0.08) {
      // Sampled on an interval, never per frame: reading a rect forces layout.
      sampleAt.current = now;
      const rect = el.getBoundingClientRect();
      anchor.current.set(
        (rect.left + rect.width / 2) / Math.max(window.innerWidth, 1),
        1 - (rect.top + rect.height / 2) / Math.max(window.innerHeight, 1)
      );
    }

    const effect = effectRef.current;
    if (!effect) return;

    smoothedFocus.current = lerp(
      smoothedFocus.current,
      pointerLive || focusLive ? 1 : 0,
      k
    );

    const eu = effect.uniforms;
    eu.get("progress").value = resolved;
    eu.get("colorNum").value = lerp(
      quality.colorNumStart,
      quality.colorNumEnd,
      resolved
    );
    // Chunky on arrival, settling to the working grid as the intro plays.
    eu.get("pixelSizeCoarse").value =
      lerp(quality.coarse, quality.coarse * 0.72, resolved) *
      lerp(2.4, 1, intro);
    eu.get("focusStrength").value =
      smoothedFocus.current * quality.focusStrength;
    eu.get("focusCenter").value.lerp(anchor.current, k);
  });

  return (
    <>
      <mesh scale={[viewport.width, viewport.height, 1]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          vertexShader={waveVertexShader}
          fragmentShader={waveFragmentShader}
          uniforms={uniforms}
        />
      </mesh>

      <EffectComposer>
        <ResolveEffect
          ref={effectRef}
          pixelSizeFine={quality.fine}
          pixelSizeCoarse={quality.coarse}
          focusRadius={quality.focusRadius}
        />
      </EffectComposer>
    </>
  );
}

/* eslint-enable react-hooks/immutability */

export default function DitherBackdrop({
  progress = 0,
  animate = true,
  interactive = true,
  compact = false,
  seed = "iecse",
}) {
  const quality = useMemo(
    () =>
      compact
        ? {
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
          }
        : {
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
          },
    [compact]
  );

  return (
    <Canvas
      camera={{ position: [0, 0, 6] }}
      dpr={compact ? 0.75 : 1}
      frameloop={animate ? "always" : "demand"}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <DitheredField
        progress={progress}
        quality={quality}
        animate={animate}
        interactive={interactive}
        seed={seed}
      />
    </Canvas>
  );
}
