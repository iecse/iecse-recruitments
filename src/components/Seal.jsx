import { useMemo } from "react";
import { SEAL_GRID, buildSeal } from "../lib/seal";
import { TIERS } from "../lib/constants";
import { asDomainList } from "../lib/validation";

/**
 * The seal is drawn as a halftone grid: one square per live cell, sized and
 * shaded by its value. It is plain SVG, so it scales, prints, and costs
 * nothing to render.
 */
export function Seal({ registration, size = 92, className = "" }) {
  const { cells } = useMemo(() => buildSeal(registration), [registration]);
  const cell = 100 / SEAL_GRID;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`Generated mark for registration number ${registration}`}
      className={className}
    >
      {cells.map(({ x, y, v }) => {
        const side = cell * (0.34 + v * 0.62);
        const offset = (cell - side) / 2;
        return (
          <rect
            key={`${x}-${y}`}
            x={x * cell + offset}
            y={y * cell + offset}
            width={side}
            height={side}
            fill="#23c8d3"
            opacity={0.3 + v * 0.7}
          />
        );
      })}
    </svg>
  );
}

/**
 * A live record of the application as it stands. It exists to fill an
 * otherwise dead column with something the applicant actually wants to look
 * at, and to make the registration number feel like an identity rather than
 * an input.
 */
export default function ApplicantCard({ form, compact = false }) {
  const registration = form.registrationNumber.trim();
  const domains = asDomainList(form.domain);
  const tier = TIERS.find((entry) => entry.value === form.tier);
  const name = form.fullName.trim();

  return (
    <div className="flex flex-col gap-4 rounded-md border border-line bg-panel p-5">
      <div className="flex items-start gap-4">
        <Seal
          registration={registration}
          size={compact ? 64 : 76}
          className="shrink-0 rounded-xs"
        />

        <div className="flex min-w-0 flex-col gap-1 pt-1">
          <p className="truncate font-display text-[15px] font-semibold text-paper">
            {name || "Your application"}
          </p>
          <p className="font-mono text-[12px] tracking-tight text-cyan">
            {registration || "Registration pending"}
          </p>
          {(form.year || form.branch) && (
            <p className="truncate text-[12px] text-faint">
              {[form.year, form.branch.trim()].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </div>

      {(domains.length > 0 || tier) && (
        <div className="flex flex-wrap gap-1.5 border-t border-line pt-4">
          {tier && (
            <span className="rounded-xs border border-cyan/40 px-2 py-1 font-mono text-[11px] text-cyan">
              {tier.name}
            </span>
          )}
          {domains.map((domain) => (
            <span
              key={domain}
              className="rounded-xs border border-line px-2 py-1 text-[11px] text-muted"
            >
              {domain}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
