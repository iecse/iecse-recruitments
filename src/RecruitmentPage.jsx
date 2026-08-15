import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Backdrop from "./components/backdrop/Backdrop";
import Button from "./components/ui/Button";
import Success from "./components/Success";
import ApplicantCard from "./components/Seal";
import { StepBar, StepTrack } from "./components/Progress";
import StepEvidence from "./components/steps/StepEvidence";
import StepIdentity from "./components/steps/StepIdentity";
import StepIntent from "./components/steps/StepIntent";
import StepPayment from "./components/steps/StepPayment";
import StepTier from "./components/steps/StepTier";
import { AlertIcon, ArrowLeft, ArrowRight, Check, Clock, Home } from "./components/ui/icons";
import { usePersistentDraft, useHashStep } from "./lib/hooks";
import {
  DEFAULT_FORM,
  MEMBERSHIP_FEE,
  STEPS,
  STORAGE_KEY,
  isTierAllowed,
  mapServerFields,
  stepForFields,
  stepsForTier,
  toApplicationPayload,
} from "./lib/constants";
import {
  asDomainList,
  completionRatio,
  firstInvalidStep,
  validateStep,
} from "./lib/validation";
import { checkRegistration, submitApplication } from "./api";
import wordmark from "./assets/iecse-wordmark-colour.svg";

const LAST_STEP = STEPS.length;

function readDraft() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { form: DEFAULT_FORM, step: 1 };

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") {
      return { form: DEFAULT_FORM, step: 1 };
    }

    const savedForm =
      parsed.form && typeof parsed.form === "object" ? parsed.form : {};
    const savedStep =
      typeof parsed.step === "number" && parsed.step >= 1 && parsed.step <= LAST_STEP
        ? parsed.step
        : 1;

    return { form: { ...DEFAULT_FORM, ...savedForm }, step: savedStep };
  } catch {
    return { form: DEFAULT_FORM, step: 1 };
  }
}

export default function RecruitmentPage() {
  const [initial] = useState(readDraft);
  const [form, setForm] = useState(initial.form);
  const [step, setStep] = useState(initial.step);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [direction, setDirection] = useState("forward");

  const headingRef = useRef(null);
  const cardRef = useRef(null);
  const mountedStep = useRef(step);

  const { savedAt, clear } = usePersistentDraft(
    STORAGE_KEY,
    useMemo(() => ({ form, step }), [form, step]),
    { enabled: !submitted }
  );

  // A hash can arrive from anywhere, including a WhatsApp forward. Clamp it to
  // the furthest step the current answers actually justify.
  const setStepFromHash = useCallback(
    (next) => {
      const invalid = firstInvalidStep(form);
      setStep(invalid ? Math.min(next, invalid.step) : next);
    },
    [form]
  );

  useHashStep(step, setStepFromHash, LAST_STEP);

  const progress = submitted ? 1 : completionRatio(form);
  const hasIdentity = form.registrationNumber.trim().length >= 6;
  const sealSeed = hasIdentity ? form.registrationNumber.trim() : "iecse";
  // Step 5 reads as "Payment" for members and "Submit" for interview tiers.
  const steps = stepsForTier(form.tier);
  const active = steps.find((entry) => entry.id === step) || steps[0];

  /* ----------------------------------------------------------------- state */

  const update = useCallback(
    (key) => (event) => {
      const value =
        event && event.target ? event.target.value : event;
      setForm((current) => {
        const next = { ...current, [key]: value };
        // Changing year can invalidate an already chosen tier. Leaving it set
        // would submit a combination the club does not allow.
        if (key === "year" && !isTierAllowed(next.tier, value)) next.tier = "";
        return next;
      });
      if (key === "registrationNumber") setDuplicate(false);
      setErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
      setSubmitError("");
    },
    []
  );

  const toggleDomain = useCallback((value) => {
    setForm((current) => {
      const list = asDomainList(current.domain);
      return {
        ...current,
        domain: list.includes(value)
          ? list.filter((entry) => entry !== value)
          : [...list, value],
      };
    });
    setErrors((current) => {
      if (!current.domain) return current;
      const next = { ...current };
      delete next.domain;
      return next;
    });
  }, []);

  const toggleConfirm = useCallback((event) => {
    const { checked } = event.target;
    setForm((current) => ({ ...current, paymentConfirmed: checked }));
    setErrors((current) => {
      if (!current.paymentConfirmed) return current;
      const next = { ...current };
      delete next.paymentConfirmed;
      return next;
    });
  }, []);

  /* ------------------------------------------------------------- behaviour */

  // Moving focus to the step heading is what makes the wizard usable with a
  // screen reader. Without it, focus stays on a button that no longer exists.
  useEffect(() => {
    if (mountedStep.current === step) return;
    mountedStep.current = step;
    headingRef.current?.focus({ preventScroll: true });
    cardRef.current?.scrollIntoView({ block: "start" });
  }, [step]);

  const focusFirstError = useCallback(() => {
    requestAnimationFrame(() => {
      const field = cardRef.current?.querySelector('[aria-invalid="true"]');
      if (field) field.focus({ preventScroll: false });
    });
  }, []);

  /** Pushes a ripple into the field from a screen point. */
  const fireImpulse = useCallback((event) => {
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    window.dispatchEvent(
      new CustomEvent("iecse:impulse", { detail: { x, y } })
    );
  }, []);

  const goNext = useCallback(() => {
    const found = validateStep(step, form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      focusFirstError();
      return;
    }
    setErrors({});
    setDirection("forward");
    setStep((current) => Math.min(current + 1, LAST_STEP));
  }, [step, form, focusFirstError]);

  const goBack = useCallback(() => {
    setErrors({});
    setDirection("back");
    setStep((current) => Math.max(current - 1, 1));
  }, []);

  const jumpTo = useCallback(
    (target) => {
      setErrors({});
      setDirection(target > step ? "forward" : "back");
      setStep(target);
    },
    [step]
  );

  /**
   * Duplicate registration numbers are rejected by a unique constraint at
   * insert time, which is a miserable place to find out. This asks the API on
   * blur and fails open: if the lookup cannot answer, nothing is shown.
   */
  const checkDuplicate = useCallback(async () => {
    const taken = await checkRegistration(form.registrationNumber);
    setDuplicate(taken);
  }, [form.registrationNumber]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (step < LAST_STEP) {
        goNext();
        return;
      }

      const invalid = firstInvalidStep(form);
      if (invalid) {
        setErrors(invalid.errors);
        setDirection(invalid.step > step ? "forward" : "back");
        setStep(invalid.step);
        focusFirstError();
        return;
      }

      setErrors({});
      setSubmitError("");
      setSubmitting(true);

      const result = await submitApplication(toApplicationPayload(form));

      setSubmitting(false);

      if (!result.ok) {
        if (result.code === "DUPLICATE") setDuplicate(true);

        // The server validates independently. When it names fields, show the
        // messages against the inputs and go to the step that owns the first
        // one; a banner alone leaves the applicant nothing to act on.
        const fields = mapServerFields(result.fields);
        const keys = Object.keys(fields);
        if (keys.length > 0) {
          setErrors(fields);
          const target = stepForFields(keys);
          setDirection(target > step ? "forward" : "back");
          setStep(target);
          focusFirstError();
          return;
        }

        setSubmitError(result.error);
        return;
      }

      clear();
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [step, form, goNext, focusFirstError, clear]
  );

  const handleClear = useCallback(() => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      setTimeout(() => setConfirmingClear(false), 4000);
      return;
    }
    clear();
    setForm(DEFAULT_FORM);
    setErrors({});
    setSubmitError("");
    setDuplicate(false);
    setConfirmingClear(false);
    setDirection("back");
    setStep(1);
  }, [confirmingClear, clear]);

  /* ----------------------------------------------------------------- render */

  const stepProps = { form, errors, update };

  const stepBody = {
    1: (
      <StepIdentity
        {...stepProps}
        onRegistrationBlur={checkDuplicate}
        duplicate={duplicate}
      />
    ),
    2: <StepIntent {...stepProps} onToggleDomain={toggleDomain} />,
    3: <StepEvidence {...stepProps} />,
    4: <StepTier {...stepProps} />,
    5: <StepPayment {...stepProps} onToggleConfirm={toggleConfirm} />,
  }[step];

  return (
    <div className="relative min-h-[100dvh]">
      {/* Field: full bleed, fixed, behind everything, at every width. Backdrop
          decides internally whether that is the shader (desktop) or the static
          gradient (phones, reduced motion, no WebGL). The gradient costs no
          bytes, so there is no reason for a phone to get a flat black page. */}
      <div className="fixed inset-0 z-0">
        <Backdrop progress={progress} seed={sealSeed} />
      </div>

      <div className="relative z-20">
        {!submitted && (
          <div className="sticky top-0 z-40 lg:hidden">
            <StepBar step={step} steps={steps} />
          </div>
        )}

        <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-8 px-5 pb-24 pt-28 sm:px-8 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10 lg:px-10 lg:py-16">
          {/* One sheet. Header and form share a single surface so the page has
              a spine instead of two islands floating on wallpaper. */}
          <div className="rounded-lg border border-line bg-ink/95 px-6 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
            {/* The hero earns step 1 and then gets out of the way. Left in
                place it cost ~700px above the form on every later step, which
                is most of the scroll distance to the payment fields. */}
            {step === 1 && !submitted ? (
              <header className="flex flex-col gap-8">
                <a
                  href="https://iecse-manipal.com"
                  className="flex w-fit items-center gap-2 rounded-sm border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted transition-colors duration-200 hover:border-line-strong hover:text-paper"
                >
                  <Home size={14} strokeWidth={2} aria-hidden="true" />
                  Club site
                </a>

                <div className="flex flex-col gap-5">
                  <h1 className="font-display text-[40px] font-semibold leading-[0.95] tracking-[-0.035em] text-paper sm:text-[54px] lg:text-[64px]">
                    Apply to{" "}
                    <img
                      src={wordmark}
                      alt="IECSE"
                      className="ml-2 inline-block h-[0.92em] w-auto translate-y-[0.04em] align-baseline"
                    />
                  </h1>
                  <p className="max-w-[42ch] text-[17px] leading-relaxed text-muted">
                    The computer science club at MIT Manipal. Workshops, real
                    projects, and a room full of people who build things.
                    Applications for this year are open to first and second years.
                  </p>

                  <p className="font-statement mt-2 flex flex-wrap items-baseline gap-x-3 text-[26px] uppercase leading-none tracking-[0.06em] text-paper sm:text-[32px]">
                    <span>Join.</span>
                    <span>Contribute.</span>
                    <span className="text-cyan">Create impact.</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                  <span className="flex items-center gap-2">
                    <Clock size={13} strokeWidth={2} aria-hidden="true" />
                    About 6 minutes
                  </span>
                  {savedAt > 0 && !submitted && (
                    <span
                      className="saved-flash flex items-center gap-2 text-cyan"
                      aria-hidden="true"
                    >
                      <Check size={13} strokeWidth={2.5} aria-hidden="true" />
                      Draft saved
                    </span>
                  )}
                </div>
              </header>
            ) : (
              <header className="flex items-center justify-between gap-4 border-b border-line pb-6">
                <a href="https://iecse-manipal.com" className="shrink-0">
                  <img src={wordmark} alt="IECSE" className="h-[24px] w-auto" />
                </a>
                <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                  {/* Not uppercased with the rest of the row. Rs is a currency
                      abbreviation, not an acronym, and RS 250 reads as neither
                      rupees nor anything else. */}
                  <span className="normal-case">Rs {MEMBERSHIP_FEE}</span>
                  <span aria-hidden="true">/</span>
                  <span>
                    Step {submitted ? LAST_STEP : step} of {LAST_STEP}
                  </span>
                  {savedAt > 0 && !submitted && (
                    <span
                      className="saved-flash flex items-center gap-1.5 text-cyan"
                      aria-hidden="true"
                    >
                      <Check size={12} strokeWidth={2.5} />
                      Saved
                    </span>
                  )}
                </p>
              </header>
            )}

            <main
              ref={cardRef}
              className={`scroll-mt-[72px] lg:scroll-mt-8 ${step === 1 && !submitted ? "mt-14 lg:mt-16" : "mt-8"
                }`}
            >
              {submitted ? (
                <Success form={form} />
              ) : (
                <form onSubmit={handleSubmit} noValidate>
                  <div className="hidden lg:block">
                    <StepTrack step={step} onJump={jumpTo} steps={steps} />
                  </div>

                  <div className="mb-10 mt-10 flex flex-col gap-2">
                    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-cyan">
                      Step {step} of {LAST_STEP}
                    </p>
                    <h2
                      ref={headingRef}
                      tabIndex={-1}
                      className="font-display text-[27px] font-semibold leading-[1.08] tracking-[-0.025em] text-paper outline-none sm:text-[33px]"
                    >
                      {active.title}
                    </h2>
                  </div>

                  <div
                    key={step}
                    className={direction === "forward" ? "step-forward" : "step-back"}
                  >
                    {stepBody}
                  </div>

                  {submitError && (
                    <p
                      role="alert"
                      className="mt-8 flex items-start gap-2.5 rounded-sm border border-alert/45 bg-alert/[0.07] px-4 py-3 text-[14px] leading-relaxed text-paper"
                    >
                      <AlertIcon
                        size={16}
                        strokeWidth={2}
                        className="mt-[2px] shrink-0 text-alert"
                        aria-hidden="true"
                      />
                      <span>{submitError}</span>
                    </p>
                  )}



                  <div className="mt-12 flex flex-col-reverse gap-3 border-t border-line pt-7 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    {step > 1 ? (
                      <Button variant="quiet" onClick={goBack}>
                        <ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
                        Back
                      </Button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleClear}
                        className="rounded-sm px-1 font-mono text-[11px] uppercase tracking-[0.12em] text-faint transition-colors duration-200 hover:text-muted"
                      >
                        {confirmingClear ? "Tap again to erase" : "Clear draft"}
                      </button>
                    )}

                    <Button
                      type="submit"
                      loading={submitting}
                      onClick={fireImpulse}
                      className="w-full sm:w-auto"
                    >
                      {step === LAST_STEP ? "Submit application" : "Continue"}
                      {!submitting && (
                        <ArrowRight size={15} strokeWidth={2.2} aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </main>
          </div>

          {/* Meta rail. Narrow, aligned to the same grid as the sheet, sticky.
              Carries the seal and what it means, so the right side stops being
              decoration. */}
          <aside className="hidden lg:block">
            <div className="sticky top-16">
              {hasIdentity && !submitted ? (
                <ApplicantCard form={form} compact />
              ) : (
                /* Reserved space is worse than useless when empty, so before
                   there is a mark to show it carries the facts an applicant
                   would otherwise scroll back up to check. */
                <dl className="flex flex-col gap-4 rounded-md border border-line bg-ink/95 p-5">
                  {[
                    ["Membership", `Rs ${MEMBERSHIP_FEE} for the year`],
                    ["Steps", `${LAST_STEP}, saved as you go`],
                    ["Time", "About 6 minutes"],
                    ["Payment", "Checked by hand, a few days"],
                  ].map(([term, value]) => (
                    <div key={term} className="flex flex-col gap-1">
                      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                        {term}
                      </dt>
                      <dd className="text-[13px] leading-snug text-muted">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
