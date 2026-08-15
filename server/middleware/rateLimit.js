/**
 * Rate limiting middleware.
 *
 * Three tiers:
 *   1. Global:  100 req/min per IP — general abuse prevention
 *   2. Submit:  3 submissions/hour per IP — stops mass fake accounts
 *   3. Check:   10 checks/min per IP — duplicate-check endpoint
 */

import rateLimit from "express-rate-limit";

/** Global rate limit: 100 requests per minute per IP. */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please slow down.",
    retryAfter: 60,
  },
});

/** Submit rate limit: 3 submissions per hour per IP. */
export const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many submissions. You can submit up to 3 applications per hour.",
    retryAfter: 3600,
  },
  keyGenerator: (req) => {
    // Use X-Forwarded-For if behind a proxy, otherwise remote IP.
    return req.ip || req.connection.remoteAddress;
  },
});

/** Duplicate-check rate limit: 10 lookups per minute per IP. */
export const checkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many lookups. Please slow down.",
    retryAfter: 60,
  },
});
