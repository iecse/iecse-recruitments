import { AlertIcon } from "./icons";
import { useField } from "./useField";

/**
 * Form primitives.
 *
 * Rules that hold everywhere: the label sits above the control, the error sits
 * below it, the placeholder is never the label, and the control is wired to its
 * message with aria-describedby so a screen reader hears the problem.
 */

const controlBase =
  "w-full min-h-[52px] rounded-sm border bg-[#0d0c15] px-4 py-3 text-[15px] font-medium text-paper " +
  "transition-colors duration-200 outline-none placeholder:font-normal placeholder:text-faint " +
  "hover:border-line-strong focus:border-cyan focus:bg-[#111020]";

const controlState = (invalid) =>
  invalid ? "border-alert/70 focus:border-alert" : "border-line-strong";

export function Field({
  label,
  hint,
  error,
  optional = false,
  htmlFor,
  describedBy,
  children,
  className = "",
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline gap-2 text-[13px] font-medium text-muted"
      >
        {label}
        {optional && (
          <span className="text-[12px] font-normal text-faint">
            optional
          </span>
        )}
      </label>

      {hint && (
        <p id={`${describedBy}-hint`} className="-mt-1 text-[13.5px] leading-relaxed text-faint">
          {hint}
        </p>
      )}

      {children}

      {/* Slot is always present so clearing an error does not shift every
          field below it. Measured at 26px of jump per error row before this. */}
      <p
        id={`${describedBy}-error`}
        role={error ? "alert" : undefined}
        className={`flex min-h-[18px] items-start gap-2 text-[13px] leading-snug text-alert ${
          error ? "" : "invisible"
        }`}
      >
        {error && (
          <>
            <AlertIcon size={15} strokeWidth={2} className="mt-[2px] shrink-0" />
            <span>{error}</span>
          </>
        )}
      </p>
    </div>
  );
}

export function TextInput({ name, label, hint, error, optional, className, ...rest }) {
  const { id, describedBy, controlProps } = useField(name, { hint, error });
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      htmlFor={id}
      describedBy={describedBy}
      className={className}
    >
      <input
        {...controlProps}
        {...rest}
        name={name}
        className={`${controlBase} ${controlState(Boolean(error))}`}
      />
    </Field>
  );
}

export function TextArea({
  name,
  label,
  hint,
  error,
  optional,
  className,
  counter,
  value = "",
  ...rest
}) {
  const { id, describedBy, controlProps } = useField(name, { hint, error });
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      htmlFor={id}
      describedBy={describedBy}
      className={className}
    >
      <div className="relative">
        <textarea
          {...controlProps}
          {...rest}
          name={name}
          value={value}
          className={`${controlBase} resize-y leading-relaxed ${controlState(Boolean(error))}`}
        />
        {counter && (
          <span
            className={`pointer-events-none absolute bottom-3 right-3 font-mono text-[11px] ${
              value.trim().length >= counter ? "text-cyan" : "text-faint"
            }`}
          >
            {value.trim().length} / {counter}
          </span>
        )}
      </div>
    </Field>
  );
}

export function Select({ name, label, hint, error, children, className, ...rest }) {
  const { id, describedBy, controlProps } = useField(name, { hint, error });
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      htmlFor={id}
      describedBy={describedBy}
      className={className}
    >
      <div className="relative">
        <select
          {...controlProps}
          {...rest}
          name={name}
          className={`${controlBase} cursor-pointer appearance-none pr-11 ${controlState(
            Boolean(error)
          )}`}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 14 9"
          className="pointer-events-none absolute right-4 top-1/2 h-[9px] w-[14px] -translate-y-1/2"
        >
          <path
            d="M1 1l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-faint"
          />
        </svg>
      </div>
    </Field>
  );
}

export function CheckboxField({ name, error, checked, onChange, children }) {
  const { id, controlProps } = useField(name, { error });
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors duration-200 ${
          checked
            ? "border-cyan/50 bg-cyan/[0.06]"
            : "border-line bg-surface hover:border-line-strong"
        } ${error ? "border-alert/70" : ""}`}
      >
        <input
          {...controlProps}
          type="checkbox"
          name={name}
          checked={checked}
          onChange={onChange}
          className="mt-[2px] h-[18px] w-[18px] shrink-0 cursor-pointer"
        />
        <span className="text-[14px] leading-relaxed text-muted">{children}</span>
      </label>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-2 text-[13px] text-alert"
        >
          <AlertIcon size={15} strokeWidth={2} className="mt-[2px] shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
