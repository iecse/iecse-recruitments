/**
 * Validation returns a map of field name to message rather than a single
 * string, so every error can be rendered against the input that caused it and
 * announced through aria-describedby.
 */

import { isTierAllowed, paysOnApplication } from "./constants";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_LIKE = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/.*)?$/i;
const DIGITS_ONLY = /^\d+$/;
const TEN_DIGITS = /^\d{10}$/;

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
    } else if (reg.length < 9) {
      // The server enforces the same bounds. Catching them here keeps the
      // applicant from finding out on the last screen.
      errors.registrationNumber = "That is too short. Registration numbers are 9 digits.";
    } else if (reg.length > 20) {
      errors.registrationNumber = "That is too long for a registration number.";
    }
  }

  if (!form.year) errors.year = "Select your year.";
  if (isBlank(form.branch)) errors.branch = "Enter your branch.";

  if (isBlank(form.learnerEmail)) {
    errors.learnerEmail = "Enter your email.";
  } else if (form.learnerEmail.trim().length > 254) {
    errors.learnerEmail = "That email address is too long.";
  } else if (!EMAIL.test(form.learnerEmail.trim())) {
    errors.learnerEmail = "That email address is not valid.";
  }

  if (isBlank(form.phoneNumber)) {
    errors.phoneNumber = "Enter your phone number.";
  } else {
    const phone = form.phoneNumber.trim();
    if (!TEN_DIGITS.test(phone)) {
      errors.phoneNumber = "Phone numbers are exactly 10 digits.";
    } else if (!/^[6-9]/.test(phone)) {
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
  } else if (form.whyJoin.trim().length < 40) {
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
    if (value.trim().length > 2048) {
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

  // Interview tiers have nothing to pay yet, so there is nothing to validate.
  if (!paysOnApplication(form.tier)) return errors;

  if (isBlank(form.paymentId)) {
    errors.paymentId = "Enter the transaction ID or UTR from your payment.";
  } else if (!/^[A-Za-z0-9]{8,64}$/.test(form.paymentId.trim())) {
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
    ...(paysOnApplication(form.tier) ? [form.paymentId] : []),
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
