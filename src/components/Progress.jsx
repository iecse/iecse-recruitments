import { STEPS } from "../lib/constants";
import { Check } from "./ui/icons";

/**
 * Progress is shown twice, in two different shapes:
 *   StepTrack desktop, a horizontal track sitting directly above the heading
 *   StepBar   mobile, a compact sticky header
 * Both are the same list semantically, so both are marked up as an ordered
 * list with aria-current on the active item.
 */

export function StepTrack({ step, onJump, steps = STEPS }) {
  return (
    <nav aria-label="Application progress">
      <ol className="flex items-stretch gap-1.5">
        {steps.map((entry) => {
          const state =
            step > entry.id ? "done" : step === entry.id ? "current" : "todo";
          const reachable = entry.id < step;

          const body = (
            <>
              <span
                aria-hidden="true"
                className={`block h-[4px] w-full rounded-full transition-colors duration-500 ${
                  state === "todo" ? "bg-line" : "bg-cyan"
                }`}
              />
              <span
                className={`flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-300 ${
                  state === "current"
                    ? "text-cyan"
                    : state === "done"
                      ? "text-muted"
                      : "text-faint"
                }`}
              >
                {state === "done" && (
                  <Check size={10} strokeWidth={3.5} aria-hidden="true" />
                )}
                {entry.label}
              </span>
            </>
          );

          return (
            <li
              key={entry.id}
              aria-current={state === "current" ? "step" : undefined}
              className="flex-1"
            >
              {reachable ? (
                <button
                  type="button"
                  onClick={() => onJump(entry.id)}
                  className="flex w-full flex-col gap-2.5 rounded-sm text-left transition-opacity duration-200 hover:opacity-70"
                >
                  {body}
                  <span className="sr-only">, completed, go back to this step</span>
                </button>
              ) : (
                <div className="flex w-full flex-col gap-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepBar({ step, steps = STEPS }) {
  const active = steps.find((entry) => entry.id === step) || steps[0];
  const pct = ((step - 1) / (steps.length - 1)) * 100;

  return (
    <div className="border-b border-line bg-ink px-5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-cyan">
          {active.label}
        </p>
        <p className="font-mono text-[12px] text-faint">
          {step} of {STEPS.length}
        </p>
      </div>

      <div
        className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step}
        aria-valuetext={`Step ${step} of ${STEPS.length}, ${active.title}`}
      >
        <span
          className="bg-cyan block h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-soft)]"
          style={{ width: `${Math.max(pct, 6)}%` }}
        />
      </div>
    </div>
  );
}
