/**
 * Field rules, in one place, for both sides of the wire.
 *
 * The browser validates so an applicant finds out on the step that owns the
 * field. The API validates because it is the only one of the two that cannot
 * be edited by the person filling the form. Those are different jobs, but they
 * have to agree on every number and every pattern, or the form passes locally
 * and 400s on send.
 *
 * Keeping the rules here rather than in each validator is what makes that
 * agreement structural instead of a promise in a comment. Both import this.
 * Change a rule once.
 */

export const REGISTRATION_DIGITS = 10;
export const WHY_JOIN_MIN = 40;

export const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  digitsOnly: /^\d+$/,
  /** Indian mobile numbers start 6 to 9. */
  phone: /^[6-9]\d{9}$/,
  url: /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i,
  /** UPI references are alphanumeric. The ceiling stops an unbounded write. */
  payment: /^[A-Za-z0-9]{8,64}$/,
};

/**
 * Upper bounds on everything, not only the free text fields. Without a
 * ceiling, an anonymous endpoint lets a stranger decide how many bytes land in
 * the table, up to whatever the body limit happens to be.
 */
export const MAX = {
  full_name: 200,
  branch: 100,
  registration_number: 20,
  learner_email: 254,
  phone_number: 10,
  why_join: 2000,
  projects: 3000,
  certifications: 3000,
  url: 2048,
};

export const VALID_YEARS = ["1st Year", "2nd Year"];

/**
 * The branches the club recruits from. A dropdown rather than free text,
 * because the committee sorts applicants by branch by hand and "CSE", "cse",
 * "Comp Sci" and "Computer Science & Engg" are four different values to a
 * spreadsheet and one thing to a person.
 */
export const VALID_BRANCHES = [
  "Computer Science and Engineering",
  "Mathematics and Computing",
  "Computer Science and Financial Technology",
  "Electronics and Communication Engineering",
  "Electronics and Electrical Engineering",
  "Electronics Engineering",
  "Biotechnology",
  "Chemical Engineering",
  "Civil Engineering",
];

export const VALID_DOMAINS = [
  "Coding",
  "Web Development",
  "Machine Learning",
  "Design",
];

export const VALID_TIERS = ["member", "workcomm", "mancomm"];

/** Which tiers each year may apply for. */
export const TIERS_BY_YEAR: Record<string, string[]> = {
  "1st Year": ["member", "workcomm"],
  "2nd Year": ["member", "mancomm"],
};

/**
 * Every tier pays the fee with the application. This used to be true only of
 * Member, with the committee tiers paying on selection.
 *
 * Whether a tier is interviewed is a SEPARATE question and must stay separate:
 * interview_status used to be derived from this predicate because the two
 * happened to coincide, and collapsing them again would mark every applicant
 * as needing no interview.
 */
export const requiresInterview = (tier: string) =>
  tier === "workcomm" || tier === "mancomm";

export const URL_FIELDS = [
  "github_url",
  "linkedin_url",
  "portfolio_url",
  "other_links",
];
