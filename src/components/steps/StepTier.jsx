import { tiersForYear } from "../../lib/constants";
import { AlertIcon, Check } from "../ui/icons";

/**
 * Three options as horizontal strata rather than three equal cards. Detail is
 * revealed only for the selected tier, using a 0fr to 1fr grid row so the
 * reveal animates without measuring anything in JavaScript.
 */
export default function StepTier({ form, errors, update }) {
  const selected = form.tier;
  const tiers = tiersForYear(form.year);

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="sr-only">Choose a tier</legend>

      <p className="text-[13px] leading-relaxed text-faint">
        {form.year
          ? `These are the options open to ${form.year.toLowerCase()} applicants.`
          : "The difference is what you take on."}{" "}
        Every tier pays the same Rs 250 with the application. The committee
        tiers also involve a short interview.
      </p>

      <div className="flex flex-col gap-3">
        {tiers.map((tier) => {
          const active = selected === tier.value;
          const disabled =
            (form.year === "1st Year" && tier.value === "mancomm") ||
            (form.year === "2nd Year" && tier.value === "workcomm");

          return (
            <label
              key={tier.value}
              className={`relative flex gap-4 overflow-hidden rounded-md border p-5 transition-all duration-300 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan has-[:focus-visible]:outline-offset-2 ${
                disabled
                  ? "cursor-not-allowed opacity-40 border-line bg-surface"
                  : active
                  ? "cursor-pointer border-cyan/55 bg-cyan/[0.06]"
                  : "cursor-pointer border-line bg-surface hover:border-line-strong hover:bg-surface-strong"
              }`}
            >
              {/* Accent spine, the only thing that moves on selection. */}
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 w-[3px] origin-top transition-transform duration-[400ms] ease-[var(--ease-out-soft)] ${
                  active ? "bg-cyan scale-y-100" : "scale-y-0 bg-line"
                }`}
              />

              <input
                type="radio"
                name="tier"
                value={tier.value}
                checked={active && !disabled}
                disabled={disabled}
                onChange={update("tier")}
                className="sr-only"
              />

              <span
                aria-hidden="true"
                className={`mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                  active ? "bg-cyan border-transparent text-ink" : "border-line-strong"
                }`}
              >
                {active && <Check size={11} strokeWidth={3.5} />}
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-display text-[16px] font-semibold text-paper">
                    {tier.name}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-display text-[11px] font-medium tracking-wide ${
                      tier.value === "member"
                        ? "border-line text-faint"
                        : "border-violet/45 text-violet"
                    }`}
                  >
                    {tier.commitment}
                  </span>
                </span>

                <span className="text-[13px] leading-relaxed text-muted">
                  {tier.summary}
                </span>

                <span
                  className={`grid transition-all duration-[400ms] ease-[var(--ease-out-soft)] ${
                    active ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <span className="overflow-hidden">
                    <span className="mt-2 flex flex-col gap-1.5 border-t border-line pt-3">
                      {tier.points.map((point) => (
                        <span
                          key={point}
                          className="flex items-start gap-2 text-[13px] leading-relaxed text-faint"
                        >
                          <Check
                            size={13}
                            strokeWidth={2.5}
                            className="mt-[3px] shrink-0 text-cyan"
                            aria-hidden="true"
                          />
                          {point}
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {errors.tier && (
        <p role="alert" className="flex items-start gap-2 text-[13px] text-alert">
          <AlertIcon size={15} strokeWidth={2} className="mt-[2px] shrink-0" />
          <span>{errors.tier}</span>
        </p>
      )}
    </fieldset>
  );
}
