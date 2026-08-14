import { TextArea } from "../ui/Form";
import { DOMAINS } from "../../lib/constants";
import { asDomainList } from "../../lib/validation";
import { AlertIcon, Check } from "../ui/icons";

export default function StepIntent({ form, errors, update, onToggleDomain }) {
  const selected = asDomainList(form.domain);

  return (
    <div className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="font-display text-[13px] font-medium tracking-wide text-muted">
          Domains you want in on
        </legend>
        <p className="text-[13px] leading-relaxed text-faint">
          Pick as many as genuinely interest you.
        </p>

        <div className="mt-1 grid grid-cols-1 gap-2.5">
          {DOMAINS.map((domain) => {
            const active = selected.includes(domain.value);
            return (
              <label
                key={domain.value}
                className={`group flex cursor-pointer items-start gap-3.5 rounded-md border p-4 transition-all duration-200 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan has-[:focus-visible]:outline-offset-2 ${
                  active
                    ? "border-cyan/55 bg-cyan/[0.07]"
                    : "border-line bg-surface hover:border-line-strong hover:bg-surface-strong"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={active}
                  onChange={() => onToggleDomain(domain.value)}
                />
                <span
                  aria-hidden="true"
                  className={`mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-xs border transition-colors duration-200 ${
                    active ? "bg-cyan border-transparent text-ink" : "border-line-strong"
                  }`}
                >
                  {active && <Check size={12} strokeWidth={3.5} />}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-display text-[14px] font-semibold text-paper">
                    {domain.value}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-[13px] leading-relaxed text-faint"
                  >
                    {domain.blurb}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {errors.domain && (
          <p role="alert" className="flex items-start gap-2 text-[13px] text-alert">
            <AlertIcon size={15} strokeWidth={2} className="mt-[2px] shrink-0" />
            <span>{errors.domain}</span>
          </p>
        )}
      </fieldset>

      <TextArea
        name="whyJoin"
        label="Why IECSE"
        hint="What do you want to get out of this, and what would you bring. Specifics beat enthusiasm."
        rows={6}
        counter={40}
        value={form.whyJoin}
        onChange={update("whyJoin")}
        error={errors.whyJoin}
        placeholder="Write like you are talking to a senior, not to a form."
      />
    </div>
  );
}
