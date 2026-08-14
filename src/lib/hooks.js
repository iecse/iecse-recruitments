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
