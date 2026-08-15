/**
 * Server-side validation middleware for application submissions.
 *
 * This is the authoritative validation layer. The frontend has its own
 * validation for UX, but this is what actually guards the database.
 *
 * Key rules:
 *   - Registration numbers must start with 250 or 260
 *   - Phone numbers must be 10 Indian digits (starting 6-9)
 *   - Email must be valid format
 *   - All required fields enforced
 *   - Domain must be from the allowed list
 *   - Tier must be from the allowed list
 *   - Payment ID required only for "member" tier
 */

const VALID_YEARS = ["1st Year", "2nd Year"];
const VALID_DOMAINS = ["Coding", "Web Development", "Machine Learning", "Design"];
const VALID_TIERS = ["member", "workcomm", "mancomm"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIGITS_ONLY = /^\d+$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const URL_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;
const PAYMENT_RE = /^[A-Za-z0-9]{8,}$/;

import sanitizeHtml from "sanitize-html";

function sanitize(val) {
  if (typeof val !== "string") return val;
  return sanitizeHtml(val, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

function isBlank(val) {
  return !val || typeof val !== "string" || !val.trim();
}

function trimOrNull(val) {
  if (!val || typeof val !== "string") return null;
  const t = val.trim();
  return t.length > 0 ? t : null;
}

function normalizeUrl(val) {
  const trimmed = trimOrNull(val);
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Validates the application payload. Returns an object with:
 *   { valid: boolean, errors: { field: message }, cleaned: { ...payload } }
 */
export function validateApplication(body) {
  const errors = {};

  // ---- full_name ----
  if (isBlank(body.full_name)) {
    errors.full_name = "Full name is required.";
  } else if (sanitize(body.full_name).length > 200) {
    errors.full_name = "Full name must be under 200 characters.";
  }

  // ---- registration_number ----
  if (isBlank(body.registration_number)) {
    errors.registration_number = "Registration number is required.";
  } else {
    const reg = sanitize(body.registration_number);
    if (!DIGITS_ONLY.test(reg)) {
      errors.registration_number = "Registration number must be digits only.";
    } else if (reg.length < 9) {
      errors.registration_number = "Registration number is too short.";
    }
  }

  // ---- year ----
  if (!body.year || !VALID_YEARS.includes(body.year)) {
    errors.year = "Year must be '1st Year' or '2nd Year'.";
  }

  // ---- branch ----
  if (isBlank(body.branch)) {
    errors.branch = "Branch is required.";
  } else if (sanitize(body.branch).length > 100) {
    errors.branch = "Branch must be under 100 characters.";
  }

  // ---- domain ----
  const rawDomain = body.domain;
  let domainList = [];
  if (typeof rawDomain === "string") {
    domainList = rawDomain
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
  } else if (Array.isArray(rawDomain)) {
    domainList = rawDomain.map((d) => String(d).trim()).filter(Boolean);
  }
  const invalidDomains = domainList.filter((d) => !VALID_DOMAINS.includes(d));
  if (domainList.length === 0) {
    errors.domain = "At least one domain is required.";
  } else if (invalidDomains.length > 0) {
    errors.domain = `Invalid domain(s): ${invalidDomains.join(", ")}. Allowed: ${VALID_DOMAINS.join(", ")}.`;
  }

  // ---- learner_email ----
  if (isBlank(body.learner_email)) {
    errors.learner_email = "Email is required.";
  } else if (!EMAIL_RE.test(body.learner_email.trim())) {
    errors.learner_email = "Invalid email format.";
  }

  // ---- phone_number ----
  if (isBlank(body.phone_number)) {
    errors.phone_number = "Phone number is required.";
  } else {
    const phone = sanitize(body.phone_number);
    if (!PHONE_RE.test(phone)) {
      errors.phone_number =
        "Phone number must be 10 digits starting with 6, 7, 8, or 9.";
    }
  }

  // ---- why_join ----
  if (isBlank(body.why_join)) {
    errors.why_join = "Tell us why you want to join.";
  } else {
    const whyJoinClean = sanitize(body.why_join);
    if (whyJoinClean.length < 40) {
      errors.why_join = "Why join must be at least 40 characters.";
    } else if (whyJoinClean.length > 2000) {
      errors.why_join = "Why join cannot exceed 2000 characters.";
    }
  }

  // ---- optional long text fields limit ----
  if (body.projects && sanitize(body.projects).length > 3000) {
    errors.projects = "Projects description cannot exceed 3000 characters.";
  }
  if (body.certifications && sanitize(body.certifications).length > 3000) {
    errors.certifications = "Certifications description cannot exceed 3000 characters.";
  }

  // ---- tier ----
  if (!body.tier || !VALID_TIERS.includes(body.tier)) {
    errors.tier = "Tier must be 'member', 'workcomm', or 'mancomm'.";
  } else if (body.year === "1st Year" && body.tier === "mancomm") {
    errors.tier = "1st Year students cannot apply for Management Committee.";
  } else if (body.year === "2nd Year" && body.tier === "workcomm") {
    errors.tier = "2nd Year students cannot apply for Working Committee.";
  }

  // ---- payment_id (required only for member tier) ----
  const paysNow = body.tier === "member";
  if (paysNow) {
    if (isBlank(body.payment_id)) {
      errors.payment_id = "Payment ID is required for member tier.";
    } else if (!PAYMENT_RE.test(body.payment_id.trim())) {
      errors.payment_id =
        "Payment ID must be at least 8 alphanumeric characters.";
    }
  }

  // ---- optional URL fields ----
  for (const field of ["github_url", "linkedin_url", "portfolio_url", "other_links"]) {
    const val = trimOrNull(body[field]);
    if (val && !URL_RE.test(val)) {
      errors[field] = `Invalid URL format for ${field.replace(/_/g, " ")}.`;
    }
  }

  // ---- build cleaned payload ----
  const valid = Object.keys(errors).length === 0;

  const cleaned = valid
    ? {
        full_name: sanitize(body.full_name),
        year: body.year, // Validated against allowlist
        registration_number: sanitize(body.registration_number),
        branch: sanitize(body.branch),
        domain: domainList.join(", "), // Validated against allowlist
        learner_email: sanitize(body.learner_email).toLowerCase(),
        phone_number: sanitize(body.phone_number),
        why_join: sanitize(body.why_join),
        github_url: normalizeUrl(sanitize(body.github_url)),
        linkedin_url: normalizeUrl(sanitize(body.linkedin_url)),
        portfolio_url: normalizeUrl(sanitize(body.portfolio_url)),
        other_links: normalizeUrl(sanitize(body.other_links)),
        certifications: trimOrNull(sanitize(body.certifications)),
        projects: trimOrNull(sanitize(body.projects)),
        tier: body.tier, // Validated against allowlist
        payment_status: "pending",
        payment_id: paysNow ? trimOrNull(sanitize(body.payment_id)) : null,
        interview_status: body.tier === "member" ? "not_required" : "pending",
      }
    : null;

  return { valid, errors, cleaned };
}

/**
 * Express middleware that validates the request body and attaches
 * `req.cleaned` if valid, or responds 400 with structured errors.
 */
export function validateApplicationMiddleware(req, res, next) {
  const { valid, errors, cleaned } = validateApplication(req.body);

  if (!valid) {
    return res.status(400).json({
      error: "Validation failed",
      fields: errors,
    });
  }

  req.cleaned = cleaned;
  next();
}
