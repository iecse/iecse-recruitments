import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Subscribes to a media query and re-renders only when the match flips.
 *
 * useSyncExternalStore rather than useState plus an effect: the media query is
 * an external store, and reading it through this primitive removes both the
 * cascading render and the window where state is stale between first render and
 * the effect firing.
 */
export function useMediaQuery(query) {
  const [subscribe, getSnapshot] = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return [() => () => {}, () => false];
    }
    const list = window.matchMedia(query);
    return [
      (onChange) => {
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
      },
      () => list.matches,
    ];
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export const useReducedMotion = () =>
  useMediaQuery("(prefers-reduced-motion: reduce)");

/** True on devices whose primary input cannot hover, so no pointer effects. */
export const useCoarsePointer = () => useMediaQuery("(pointer: coarse)");

/**
 * Debounced localStorage persistence. Writes are deferred so typing does not
 * hit storage on every keystroke, and `savedAt` lets the UI confirm the save.
 */
export function usePersistentDraft(key, value, { enabled = true, delay = 600 } = {}) {
  const [savedAt, setSavedAt] = useState(0);
  const firstRun = useRef(true);

  useEffect(() => {
    if (!enabled) return undefined;
    if (firstRun.current) {
      firstRun.current = false;
      return undefined;
    }

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        setSavedAt(Date.now());
      } catch {
        // Private mode or a full quota. Losing the draft is survivable, so
        // this stays silent rather than interrupting the applicant.
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [key, value, enabled, delay]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing useful to do */
    }
  }, [key]);

  return { savedAt, clear };
}

/**
 * Keeps the wizard step in the URL hash so the browser back button steps
 * backwards through the form instead of leaving the page.
 */
export function useHashStep(step, setStep, max) {
  const applying = useRef(false);

  useEffect(() => {
    const parse = () => {
      const match = /^#step-(\d+)$/.exec(window.location.hash);
      if (!match) return null;
      const value = Number(match[1]);
      return value >= 1 && value <= max ? value : null;
    };

    const onPop = () => {
      // An empty hash means the entry navigation, which should read as step 1
      // rather than as nothing. Bailing here left Back visibly dead whenever a
      // draft had restored to a later step.
      const next = parse();
      applying.current = true;
      setStep(next === null ? 1 : next);
    };

    window.addEventListener("hashchange", onPop);
    return () => window.removeEventListener("hashchange", onPop);
  }, [setStep, max]);

  useEffect(() => {
    const target = `#step-${step}`;
    if (window.location.hash === target) {
      applying.current = false;
      return;
    }
    if (applying.current) {
      applying.current = false;
      return;
    }
    // Any first sync with no hash is the entry navigation, whatever step the
    // draft restored to. Pushing there creates an entry that Back lands on
    // without changing the step, which reads as a dead button.
    if (!window.location.hash) {
      window.history.replaceState(null, "", target);
      return;
    }
    window.history.pushState(null, "", target);
  }, [step]);
}

/**
 * True once the page has actually painted and the browser has gone idle.
 *
 * Anything mounted on this is explicitly not first paint work. The field used
 * to start its module fetch, its module eval and three shader compiles in the
 * same frame React was rendering the form and the fonts were still arriving,
 * and the whole load felt like it stuttered.
 *
 * Idle alone is not enough of a guarantee: on a fast connection the browser
 * reports idle before it has painted anything, which is exactly the moment
 * this is trying to stay out of. Two frames first, which is a painted frame,
 * and only then ask for idle. The static field covers the gap.
 *
 * The timeout is deliberately short. Staying out of first paint needs one
 * frame, not a free main thread: waiting for real idle on a busy phone put a
 * visible pause between the page arriving and the field starting, which reads
 * as two separate loads rather than one.
 */
export function useIdleMount({ timeout = 180 } = {}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let idleHandle = null;
    let timer = null;

    const afterPaint = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(() => setReady(true), { timeout });
      } else {
        timer = setTimeout(() => setReady(true), 120);
      }
    };

    // Two frames is one painted frame: the first is the one being composed
    // when this runs, the second cannot start until it has gone out.
    const first = requestAnimationFrame(() => {
      idleHandle = requestAnimationFrame(afterPaint);
    });

    return () => {
      cancelAnimationFrame(first);
      if (timer) clearTimeout(timer);
      if (idleHandle !== null) {
        cancelAnimationFrame(idleHandle);
        window.cancelIdleCallback?.(idleHandle);
      }
    };
  }, [timeout]);

  return ready;
}
