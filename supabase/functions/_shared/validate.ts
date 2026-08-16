/**
 * Authoritative validation for an application submission.
 *
 * This is the layer that actually guards the table. The browser has its own
 * copy of the same rules for the applicant's benefit, but nothing here trusts
 * it: every field is checked again, and the payload written to the database is
 * built from an allowlist rather than from whatever arrived.
 */

import {
  MAX,
  PATTERNS,
  REGISTRATION_DIGITS,
  TIERS_BY_YEAR,
  URL_FIELDS,
  VALID_BRANCHES,
  VALID_DOMAINS,
  VALID_TIERS,
  VALID_YEARS,
  WHY_JOIN_MIN,
  requiresInterview,
} from "./rules.ts";

/**
 * Strips anything that could be markup, then trims.
 *
 * The Express version used sanitize-html with an empty tag allowlist, which is
 * a large dependency for "remove every tag". Nothing here is ever rendered as
 * HTML: React escapes on the way out and the committee reads these in a
 * spreadsheet. Removing angle brackets and control characters is the whole job.
 */
const TAGS = /<[^>]*>/g;
const ANGLE_BRACKETS = /[<>]/g;
/** Written with escapes so no control character lives literally in this file. */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

function sanitize(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(TAGS, "")
    .replace(ANGLE_BRACKETS, "")
    .replace(CONTROL_CHARS, "")
    .trim();
}

const isBlank = (value: unknown) =>
  typeof value !== "string" || value.trim().length === 0;

function orNull(value: unknown): string | null {
  const clean = sanitize(value);
  return clean.length > 0 ? clean : null;
}

function normaliseUrl(value: unknown): string | null {
  const clean = orNull(value);
  if (!clean) return null;
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  cleaned: Record<string, unknown> | null;
}

export function validateApplication(
  body: Record<string, unknown>,
): ValidationResult {
  const errors: Record<string, string> = {};

  /* ---- full_name ---- */
  if (isBlank(body.full_name)) {
    errors.full_name = "Full name is required.";
  } else if (sanitize(body.full_name).length > MAX.full_name) {
    errors.full_name = `Full name must be under ${MAX.full_name} characters.`;
  }

  /* ---- registration_number ---- */
  if (isBlank(body.registration_number)) {
    errors.registration_number = "Registration number is required.";
  } else {
    const reg = sanitize(body.registration_number);
    if (!PATTERNS.digitsOnly.test(reg)) {
      errors.registration_number = "Registration number must be digits only.";
    } else if (reg.length !== REGISTRATION_DIGITS) {
      errors.registration_number =
        `Registration number must be exactly ${REGISTRATION_DIGITS} digits.`;
    }
  }

  /* ---- year ---- */
  const year = typeof body.year === "string" ? body.year : "";
  if (!VALID_YEARS.includes(year)) {
    errors.year = "Year must be '1st Year' or '2nd Year'.";
  }

  /* ---- branch ---- */
  if (isBlank(body.branch)) {
    errors.branch = "Branch is required.";
  } else if (!VALID_BRANCHES.includes(sanitize(body.branch))) {
    // Allowlisted now that it is a dropdown. Free text would let anything
    // through, and the committee sorts these by hand.
    errors.branch = "Choose a branch from the list.";
  }

  /* ---- domain ---- */
  const raw = body.domain;
  const domainList = (typeof raw === "string"
    ? raw.split(",")
    : Array.isArray(raw)
    ? raw.map(String)
    : [])
    .map((entry) => entry.trim())
    .filter(Boolean);

  const unknownDomains = domainList.filter((d) => !VALID_DOMAINS.includes(d));
  if (domainList.length === 0) {
    errors.domain = "At least one domain is required.";
  } else if (unknownDomains.length > 0) {
    errors.domain = `Invalid domain(s): ${unknownDomains.join(", ")}.`;
  }

  /* ---- learner_email ---- */
  if (isBlank(body.learner_email)) {
    errors.learner_email = "Email is required.";
  } else {
    const email = String(body.learner_email).trim();
    if (email.length > MAX.learner_email) {
      errors.learner_email = "Email address is too long.";
    } else if (!PATTERNS.email.test(email)) {
      errors.learner_email = "Invalid email format.";
    }
  }

  /* ---- phone_number ---- */
  if (isBlank(body.phone_number)) {
    errors.phone_number = "Phone number is required.";
  } else if (!PATTERNS.phone.test(sanitize(body.phone_number))) {
    errors.phone_number =
      "Phone number must be 10 digits starting with 6, 7, 8, or 9.";
  }

  /* ---- why_join ---- */
  if (isBlank(body.why_join)) {
    errors.why_join = "Tell us why you want to join.";
  } else {
    const why = sanitize(body.why_join);
    if (why.length < WHY_JOIN_MIN) {
      errors.why_join = `Why join must be at least ${WHY_JOIN_MIN} characters.`;
    } else if (why.length > MAX.why_join) {
      errors.why_join = `Why join cannot exceed ${MAX.why_join} characters.`;
    }
  }

  /* ---- optional long text ---- */
  if (body.projects && sanitize(body.projects).length > MAX.projects) {
    errors.projects = `Projects cannot exceed ${MAX.projects} characters.`;
  }
  if (
    body.certifications &&
    sanitize(body.certifications).length > MAX.certifications
  ) {
    errors.certifications =
      `Certifications cannot exceed ${MAX.certifications} characters.`;
  }

  /* ---- tier, and whether the year allows it ---- */
  const tier = typeof body.tier === "string" ? body.tier : "";
  if (!VALID_TIERS.includes(tier)) {
    errors.tier = "Tier must be 'member', 'workcomm', or 'mancomm'.";
  } else {
    const allowed = TIERS_BY_YEAR[year];
    if (allowed && !allowed.includes(tier)) {
      errors.tier = `${year} students cannot apply for that tier.`;
    }
  }

  /* ---- payment, required for every tier ---- */
  if (isBlank(body.payment_id)) {
    errors.payment_id = "Payment reference is required.";
  } else if (!PATTERNS.payment.test(String(body.payment_id).trim())) {
    errors.payment_id = "Payment ID must be 8 to 64 alphanumeric characters.";
  }

  /* ---- optional URLs ---- */
  for (const field of URL_FIELDS) {
    const value = orNull(body[field]);
    if (!value) continue;
    if (value.length > MAX.url) {
      errors[field] = `That ${field.replace(/_/g, " ")} is too long.`;
    } else if (!PATTERNS.url.test(value)) {
      errors[field] = `Invalid URL format for ${field.replace(/_/g, " ")}.`;
    }
  }

  const valid = Object.keys(errors).length === 0;
  if (!valid) return { valid, errors, cleaned: null };

  /* The row is built here, from an allowlist. Anything else in the request
     body is dropped rather than passed through, and the two status columns are
     derived rather than accepted, so a client cannot mark itself paid. */
  return {
    valid,
    errors,
    cleaned: {
      full_name: sanitize(body.full_name),
      year,
      registration_number: sanitize(body.registration_number),
      branch: sanitize(body.branch),
      domain: domainList.join(", "),
      learner_email: String(body.learner_email).trim().toLowerCase(),
      phone_number: sanitize(body.phone_number),
      why_join: sanitize(body.why_join),
      github_url: normaliseUrl(body.github_url),
      linkedin_url: normaliseUrl(body.linkedin_url),
      portfolio_url: normaliseUrl(body.portfolio_url),
      other_links: normaliseUrl(body.other_links),
      certifications: orNull(body.certifications),
      projects: orNull(body.projects),
      tier,
      payment_status: "pending",
      payment_id: orNull(body.payment_id),
      // From the tier, not from whether they paid. Everyone pays now, so
      // deriving this from payment would mark every applicant as needing no
      // interview.
      interview_status: requiresInterview(tier) ? "pending" : "not_required",
    },
  };
}
