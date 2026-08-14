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

export const TIERS = [
  {
    value: "member",
    name: "Member",
    commitment: "No interview",
    summary: "Access to every session, workshop, and internal event we run.",
    points: [
      "Attend all workshops and talks",
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
      "Everything in Member",
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
      "Everything in Working Committee",
      "Set direction for a domain",
      "Lead recruitment and partnerships",
    ],
  },
];

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

/** Maps camelCase form state onto the snake_case columns Supabase expects. */
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
