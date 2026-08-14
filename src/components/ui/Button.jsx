import { Loader } from "./icons";

const base =
  "inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap rounded-md " +
  "px-6 font-display text-[14px] font-semibold tracking-wide transition-all duration-200 " +
  "disabled:cursor-not-allowed disabled:opacity-55";

/**
 * No gradients and no glow. The primary action is a solid light slab on a dark
 * page, which is the highest contrast thing available and needs no effect to
 * read as the primary action. Cyan is reserved for state, never for fill.
 */
const variants = {
  primary: "bg-paper text-ink hover:bg-white active:bg-muted",
  secondary:
    "border border-line bg-transparent text-paper hover:border-line-strong hover:bg-surface",
  quiet: "px-3 text-muted hover:text-paper",
};

export default function Button({
  variant = "primary",
  loading = false,
  disabled,
  children,
  className = "",
  ...rest
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading && (
        <Loader
          size={16}
          strokeWidth={2.4}
          className="motion-safe:animate-spin"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
