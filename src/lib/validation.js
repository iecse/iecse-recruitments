/**
 * Validation returns a map of field name to message rather than a single
 * string, so every error can be rendered against the input that caused it and
 * announced through aria-describedby.
 */

import { BRANCHES, isTierAllowed } from "./constants";
/* The single source for every pattern and bound. The API imports the same
   file, so the two cannot disagree about what is valid. Anything checked in
   both places must come from here rather than be written out twice. */
import {
  MAX,
  PATTERNS,
  REGISTRATION_DIGITS as SHARED_REGISTRATION_DIGITS,
  WHY_JOIN_MIN,
} from "../../supabase/functions/_shared/rules";

const EMAIL = PATTERNS.email;
const URL_LIKE = PATTERNS.url;
const DIGITS_ONLY = PATTERNS.digitsOnly;

export const REGISTRATION_DIGITS = SHARED_REGISTRATION_DIGITS;

const isBlank = (value) => !value || !value.trim();

export const asDomainList = (domain) => {
  if (Array.isArray(domain)) return domain;
  return domain ? domain.split(", ").filter(Boolean) : [];
};

function validateIdentity(form) {
  const errors = {};

  if (isBlank(form.fullName)) errors.fullName = "Enter your full name.";

  if (isBlank(form.registrationNumber)) {
    errors.registrationNumber = "Enter your registration number.";
  } else {
    const reg = form.registrationNumber.trim();
    if (!DIGITS_ONLY.test(reg)) {
      errors.registrationNumber = "Registration numbers are digits only.";
    } else if (reg.length !== REGISTRATION_DIGITS) {
      // The server enforces the same length. Catching it here keeps the
      // applicant from finding out on the last screen.
      errors.registrationNumber = `Registration numbers are exactly ${REGISTRATION_DIGITS} digits.`;
    }
  }

  if (!form.year) errors.year = "Select your year.";
  if (isBlank(form.branch)) errors.branch = "Select your branch.";
  else if (!BRANCHES.includes(form.branch.trim())) {
    errors.branch = "Choose a branch from the list.";
  }

  if (isBlank(form.learnerEmail)) {
    errors.learnerEmail = "Enter your email.";
  } else if (form.learnerEmail.trim().length > MAX.learner_email) {
    errors.learnerEmail = "That email address is too long.";
  } else if (!EMAIL.test(form.learnerEmail.trim())) {
    errors.learnerEmail = "That email address is not valid.";
  }

  if (isBlank(form.phoneNumber)) {
    errors.phoneNumber = "Enter your phone number.";
  } else {
    const phone = form.phoneNumber.trim();
    if (!/^\d{10}$/.test(phone)) {
      errors.phoneNumber = "Phone numbers are exactly 10 digits.";
    } else if (!PATTERNS.phone.test(phone)) {
      errors.phoneNumber = "Indian phone numbers start with 6, 7, 8, or 9.";
    }
  }

  return errors;
}

function validateIntent(form) {
  const errors = {};

  if (asDomainList(form.domain).length === 0) {
    errors.domain = "Pick at least one domain.";
  }

  if (isBlank(form.whyJoin)) {
    errors.whyJoin = "Tell us why you want to join.";
  } else if (form.whyJoin.trim().length < WHY_JOIN_MIN) {
    errors.whyJoin = "Give us a bit more, at least a couple of sentences.";
  }

  return errors;
}

function validateEvidence(form) {
  const errors = {};
  const linkFields = {
    githubUrl: "GitHub",
    linkedinUrl: "LinkedIn",
    portfolioUrl: "portfolio",
    otherLinks: "link",
  };

  Object.entries(linkFields).forEach(([key, label]) => {
    const value = form[key];
    if (isBlank(value)) return;
    if (value.trim().length > MAX.url) {
      errors[key] = `That ${label} link is too long.`;
    } else if (!URL_LIKE.test(value.trim())) {
      errors[key] = `That does not look like a valid ${label} URL.`;
    }
  });

  return errors;
}

function validateTier(form) {
  const errors = {};
  if (!form.tier) {
    errors.tier = "Choose how involved you want to be.";
    return errors;
  }

  // Catches a restored draft, or a year changed after a tier was picked.
  if (!isTierAllowed(form.tier, form.year)) {
    errors.tier = "That option is not open to your year. Pick another.";
  }
  return errors;
}

function validatePayment(form) {
  const errors = {};

  if (isBlank(form.paymentId)) {
    errors.paymentId = "Enter the transaction ID or UTR from your payment.";
  } else if (!PATTERNS.payment.test(form.paymentId.trim())) {
    errors.paymentId =
      "A UPI reference is at least 8 characters, letters and digits only.";
  }

  if (!form.paymentConfirmed) {
    errors.paymentConfirmed = "Confirm that you have completed the payment.";
  }

  return errors;
}

const VALIDATORS = {
  1: validateIdentity,
  2: validateIntent,
  3: validateEvidence,
  4: validateTier,
  5: validatePayment,
};

export function validateStep(step, form) {
  const validator = VALIDATORS[step];
  return validator ? validator(form) : {};
}

/** Returns the first step that fails, or null when the whole form is valid. */
export function firstInvalidStep(form) {
  for (const step of [1, 2, 3, 4, 5]) {
    const errors = validateStep(step, form);
    if (Object.keys(errors).length > 0) return { step, errors };
  }
  return null;
}

/**
 * Fraction of the application that is filled in. Drives the backdrop resolve,
 * so it counts optional work too: the field sharpens as the applicant puts
 * more of themselves into it.
 */
export function completionRatio(form) {
  const required = [
    form.fullName,
    form.registrationNumber,
    form.year,
    form.branch,
    form.learnerEmail,
    form.phoneNumber,
    form.whyJoin,
    form.tier,
    // Only counted when the applicant actually owes a payment now.
    form.paymentId,
  ];
  const optional = [
    form.projects,
    form.githubUrl,
    form.linkedinUrl,
    form.portfolioUrl,
    form.certifications,
  ];

  const filled = (list) => list.filter((value) => !isBlank(value)).length;

  const requiredScore = filled(required) + (asDomainList(form.domain).length > 0 ? 1 : 0);
  const optionalScore = filled(optional);

  // Required work carries the weight; optional work adds the last stretch.
  const score = (requiredScore / (required.length + 1)) * 0.85 + (optionalScore / optional.length) * 0.15;

  return Math.max(0, Math.min(1, score));
}
