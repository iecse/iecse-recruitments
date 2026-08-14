import { Suspense, lazy, useState } from "react";
import StaticDither from "./StaticDither";
import { useCoarsePointer, useMediaQuery, useReducedMotion } from "../../lib/hooks";

/**
 * The WebGL field is the single heaviest thing on the page, so it is code
 * split and never blocks first paint. Until it arrives, and on any device that
 * cannot or should not run it, a static gradient stands in.
 */
const DitherBackdrop = lazy(() => import("./DitherBackdrop"));

const STATIC_FIELD =
  "radial-gradient(120% 80% at 18% 0%, rgba(31,68,166,0.9) 0%, rgba(5,5,5,0) 62%)," +
  "radial-gradient(90% 70% at 88% 22%, rgba(31,68,166,0.42) 0%, rgba(5,5,5,0) 60%)," +
  "radial-gradient(80% 60% at 50% 100%, rgba(35,200,211,0.16) 0%, rgba(5,5,5,0) 58%)," +
  "#050505";

/**
 * Probing for WebGL creates a real context. Left alive, every probe counts
 * against the browser limit (Chrome drops the oldest past ~16), so a page that
 * probes on each mount eventually reports false for a machine that is fine.
 * Release it immediately, and cache the answer.
 */
let webglSupport = null;

function hasWebGL() {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    webglSupport = Boolean(window.WebGLRenderingContext && gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return webglSupport;
  } catch {
    webglSupport = false;
    return false;
  }
}

function StaticField({ seed }) {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="absolute inset-0" style={{ background: STATIC_FIELD }} />
      <StaticDither seed={seed} />
    </div>
  );
}

export default function Backdrop({ progress, seed = "iecse", allowShader = true }) {
  const reducedMotion = useReducedMotion();
  const coarsePointer = useCoarsePointer();
  const [webgl] = useState(hasWebGL);
  // Tailwind hidden/lg:hidden only affects paint, so the mount decision has to
  // happen in JS. A viewport query alone is not enough: above lg it is true for
  // the desktop field AND for the lg:hidden mobile strip, which is how two live
  // contexts survived the first attempt at this. Call sites that must never run
  // the shader say so explicitly.
  const wide = useMediaQuery("(min-width: 1024px)");

  // Below lg the field is a 210px strip that scrolls away in one swipe. It is
  // not worth 253 KB gzip of three.js, and neither is a single static frame
  // for someone who asked for reduced motion.
  const showShader = allowShader && webgl && wide && !reducedMotion;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {showShader ? (
        <Suspense fallback={<StaticField seed={seed} />}>
          <div className="field-in absolute inset-0">
          <DitherBackdrop
            progress={progress}
            seed={seed}
            animate={!reducedMotion}
            interactive={!reducedMotion}
            compact={coarsePointer}
          />
          </div>
        </Suspense>
      ) : (
        <StaticField seed={seed} />
      )}

      {/* The field owns this pane, so the only treatment is a feather where it
          meets the content column and a slight settle at the edges. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(5,5,5,0.72) 0%, rgba(5,5,5,0.3) 24%, rgba(5,5,5,0) 50%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 70% at 50% 50%, rgba(5,5,5,0) 48%, rgba(5,5,5,0.42) 100%)",
        }}
      />
    </div>
  );
}
