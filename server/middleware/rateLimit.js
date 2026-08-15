/**
 * Rate limiting middleware.
 *
 * The threat here is not a determined attacker, it is a bored one with a
 * script, and the cost of getting it wrong is not a breach, it is a first year
 * who cannot apply. Campus wifi puts hundreds of students behind a handful of
 * NAT addresses, so anything keyed on IP is really keyed on "everyone in that
 * building". The limits below are set to stop bulk junk without ever being
 * reachable by a person filling the form in good faith.
 */

import rateLimit from "express-rate-limit";

/**
 * express-rate-limit's own key generator normalises IPv6 to a /56 block. A
 * custom one returning req.ip raw looks equivalent and is not: a single IPv6
 * allocation hands out more addresses than the limiter can count, so every
 * request arrives with a fresh key and the limit never applies. Do not
 * reintroduce keyGenerator here without handling that.
 */

/** Global: catches scripted hammering of any endpoint. */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please slow down.",
    retryAfter: 60,
  },
});

/**
 * Submissions. Was 3 per hour, which on a shared campus address is roughly
 * "the first three applicants win and everyone else is told to come back
 * later". A real applicant submits once, twice if something went wrong.
 */
export const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: {
    error:
      "That is a lot of submissions from this network. Wait a few minutes and try again, or tell the committee.",
    retryAfter: 900,
  },
});

/** Duplicate lookups. Cheap and read only, but see the note in the route. */
export const checkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many lookups. Please slow down.",
    retryAfter: 60,
  },
});
