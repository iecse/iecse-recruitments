import { useId } from "react";

/** Wires label, hint and error ids together for one control. */
export function useField(name, { hint, error }) {
  const id = useId();
  const base = `${name}-${id}`;
  const described = [
    hint ? `${base}-hint` : null,
    error ? `${base}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: base,
    describedBy: base,
    controlProps: {
      id: base,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": described || undefined,
    },
  };
}

