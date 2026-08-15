/**
 * Domain constants for the recruitment flow.
 *
 * Field names, step order and enum values here are wired to the Supabase
 * `applications` table and to whatever the committee uses downstream. Renaming
 * or reordering anything in this file is a data change, not a design change.
 */

export const MEMBERSHIP_FEE = 250;

export const UPI_ACCOUNTS = [
  { id: "kushalraj198211-1@oksbi", label: "SBI", qr: "qr1" },
  { id: "kushalraj198211-1@okicici", label: "ICICI", qr: "qr2" },
];

export const WHATSAPP_GROUP_LINK =
  "https://chat.whatsapp.com/In7zQ55T1BlB7PyR9O1JaS?s=sh&p=a&ilr=0";

/* Recruitment is open to first and second years only. */
export const YEARS = ["1st Year", "2nd Year"];

export const DOMAINS = [
  {
    value: "Coding",
    blurb: "Algorithms, contests, and the fundamentals everything else sits on.",
  },
  {
    value: "Web Development",
    blurb: "Products people actually open. Frontend, backend, and the glue.",
  },
  {
    value: "Machine Learning",
    blurb: "Models, data pipelines, and the research reading group.",
  },
  {
    value: "Design",
    blurb: "Interfaces, brand, and the visual language of everything we ship.",
  },
];

export const STEPS = [
  { id: 1, key: "identity", label: "You", title: "Who is applying" },
  { id: 2, key: "intent", label: "Intent", title: "What you want to build" },
  { id: 3, key: "evidence", label: "Work", title: "What you have made" },
  { id: 4, key: "tier", label: "Tier", title: "How involved you want to be" },
  { id: 5, key: "payment", label: "Payment", title: "Membership" },
];

/**
 * Only Member applications pay while applying. Working and Management Committee
 * are interview tiers, so they pay if and when they are selected. This is the
 * single source of that rule: validation, the payload and the final step all
 * read it rather than testing the tier string themselves.
 */
export const paysOnApplication = (tier) => tier === "member";

/** Step 5 is a payment step for members and a review step for everyone else. */
export function stepsForTier(tier) {
  if (paysOnApplication(tier) || !tier) return STEPS;
  return STEPS.map((entry) =>
    entry.id === 5
      ? { ...entry, label: "Submit", title: "Review and submit" }
      : entry
  );
}

/*
 * Each tier describes itself. Nothing here may reference another committee
 * tier by name: which tiers are on screen depends on the applicant's year, so
 * "everything in Working Committee" is meaningless to a second year who is
 * never shown it. Member is the only tier both years see, so it is the only
 * one safe to build on.
 */
export const TIERS = [
  {
    value: "member",
    name: "Member",
    commitment: "No interview",
    summary: "Access to every session, workshop, and internal event we run.",
    points: [
      "Every workshop, talk and internal event",
      "Members only resources and recordings",
      "Join project teams when they open up",
    ],
  },
  {
    value: "workcomm",
    name: "Working Committee",
    commitment: "Interview required",
    summary: "You ship the work. Projects, events, and the technical output.",
    points: [
      "Everything a member gets",
      "Own deliverables on club projects",
      "Run sessions inside your domain",
    ],
  },
  {
    value: "mancomm",
    name: "Management Committee",
    commitment: "Interview required",
    summary: "You run the club. Direction, budget, and the people side.",
    points: [
      "Everything a member gets",
      "Set direction for a domain and its projects",
      "Lead recruitment, partnerships and the budget",
    ],
  },
];

/**
 * Tier eligibility by year. First years can stand for Working Committee,
 * second years for Management Committee. Member is open to both.
 *
 * Year is collected on step 1 and tier on step 4, so this is always known by
 * the time it is needed. The fallback of "everything" only applies to a draft
 * saved before a year was chosen.
 */
export const TIERS_BY_YEAR = {
  "1st Year": ["member", "workcomm"],
  "2nd Year": ["member", "mancomm"],
};

/** The tier objects a given year may choose from, in canonical order. */
export function tiersForYear(year) {
  const allowed = TIERS_BY_YEAR[year];
  return allowed ? TIERS.filter((tier) => allowed.includes(tier.value)) : TIERS;
}

export function isTierAllowed(tier, year) {
  if (!tier) return false;
  const allowed = TIERS_BY_YEAR[year];
  return allowed ? allowed.includes(tier) : true;
}

export const STORAGE_KEY = "iecse_recruitment_draft";

export const DEFAULT_FORM = {
  fullName: "",
  year: "",
  registrationNumber: "",
  branch: "",
  domain: [],
  learnerEmail: "",
  phoneNumber: "",
  whyJoin: "",
  projects: "",
  githubUrl: "",
  linkedinUrl: "",
  portfolioUrl: "",
  otherLinks: "",
  certifications: "",
  tier: "",
  paymentId: "",
  paymentConfirmed: false,
};

/**
 * Inverse of the payload mapping. The server validates independently and
 * answers in its own snake_case, so its errors have to be translated back
 * before they can be shown against an input.
 */
const PAYLOAD_TO_FORM = {
  full_name: "fullName",
  year: "year",
  registration_number: "registrationNumber",
  branch: "branch",
  domain: "domain",
  learner_email: "learnerEmail",
  phone_number: "phoneNumber",
  why_join: "whyJoin",
  github_url: "githubUrl",
  linkedin_url: "linkedinUrl",
  portfolio_url: "portfolioUrl",
  other_links: "otherLinks",
  certifications: "certifications",
  projects: "projects",
  tier: "tier",
  payment_id: "paymentId",
};

/** Which step owns each field, so a rejection can send the applicant there. */
const FIELD_STEP = {
  fullName: 1,
  year: 1,
  registrationNumber: 1,
  branch: 1,
  learnerEmail: 1,
  phoneNumber: 1,
  domain: 2,
  whyJoin: 2,
  projects: 3,
  githubUrl: 3,
  linkedinUrl: 3,
  portfolioUrl: 3,
  otherLinks: 3,
  certifications: 3,
  tier: 4,
  paymentId: 5,
  paymentConfirmed: 5,
};

/** Translates a server `fields` object into form-state error keys. */
export function mapServerFields(fields) {
  if (!fields || typeof fields !== "object") return {};
  const mapped = {};
  Object.entries(fields).forEach(([key, message]) => {
    const formKey = PAYLOAD_TO_FORM[key];
    if (formKey && typeof message === "string") mapped[formKey] = message;
  });
  return mapped;
}

/** The earliest step that owns any of the given form-state error keys. */
export function stepForFields(formKeys) {
  const steps = formKeys.map((key) => FIELD_STEP[key] || 1);
  return steps.length > 0 ? Math.min(...steps) : 1;
}

/** Maps camelCase form state onto the snake_case columns the API expects. */
export function toApplicationPayload(form) {
  const domain = Array.isArray(form.domain)
    ? form.domain.join(", ")
    : form.domain || "";

  const orNull = (value) => {
    const trimmed = (value || "").trim();
    return trimmed === "" ? null : trimmed;
  };

  // Applicants type "github.com/name". Stored raw, that is not a link anyone
  // can click out of the committee spreadsheet.
  const orUrl = (value) => {
    const trimmed = orNull(value);
    if (trimmed === null) return null;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  return {
    full_name: form.fullName.trim(),
    year: form.year,
    registration_number: form.registrationNumber.trim(),
    branch: form.branch.trim(),
    domain,
    learner_email: form.learnerEmail.trim(),
    phone_number: form.phoneNumber.trim(),
    why_join: form.whyJoin.trim(),
    github_url: orUrl(form.githubUrl),
    linkedin_url: orUrl(form.linkedinUrl),
    portfolio_url: orUrl(form.portfolioUrl),
    other_links: orUrl(form.otherLinks),
    certifications: orNull(form.certifications),
    projects: orNull(form.projects),
    tier: form.tier,
    // Still "pending" for interview tiers: they have not paid, and they will
    // owe the same fee on selection. Nothing new for the committee to learn.
    payment_status: "pending",
    payment_id: paysOnApplication(form.tier) ? orNull(form.paymentId) : null,
    interview_status: form.tier === "member" ? "not_required" : "pending",
  };
}
