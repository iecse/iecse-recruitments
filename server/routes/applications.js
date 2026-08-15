/**
 * Application routes.
 *
 * POST /api/applications       — Submit a new application
 * GET  /api/applications/check/:regNo — Check if a registration number is taken
 */

import { Router } from "express";
import db from "../db/pool.js";
import { createClient } from "@supabase/supabase-js";

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}
import { validateApplicationMiddleware } from "../middleware/validate.js";
import { checkLimiter, submitLimiter } from "../middleware/rateLimit.js";

const router = Router();

/* ------------------------------------------------------------------ submit */

router.post(
  "/",
  submitLimiter,
  validateApplicationMiddleware,
  async (req, res) => {
    const d = req.cleaned;

    try {
      if (supabase) {
        // Use Supabase REST API
        const { data, error } = await supabase
          .from("applications")
          .insert([
            {
              full_name: d.full_name,
              year: d.year,
              registration_number: d.registration_number,
              branch: d.branch,
              domain: d.domain,
              learner_email: d.learner_email,
              phone_number: d.phone_number,
              why_join: d.why_join,
              github_url: d.github_url,
              linkedin_url: d.linkedin_url,
              portfolio_url: d.portfolio_url,
              other_links: d.other_links,
              certifications: d.certifications,
              projects: d.projects,
              tier: d.tier,
              payment_status: d.payment_status,
              payment_id: d.payment_id,
              interview_status: d.interview_status,
            },
          ])
          .select("id")
          .single();

        if (error) {
          throw error;
        }

        console.log(`[app] Application submitted (Supabase): ${d.registration_number} (${d.full_name})`);

        return res.status(201).json({
          message: "Application submitted successfully.",
          id: data?.id ?? null,
        });
      } else {
        // Fallback to SQLite/PG raw SQL
        const sql = `
          INSERT INTO applications (
            full_name, year, registration_number, branch, domain,
            learner_email, phone_number, why_join,
            github_url, linkedin_url, portfolio_url, other_links,
            certifications, projects,
            tier, payment_status, payment_id, interview_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
          d.full_name,
          d.year,
          d.registration_number,
          d.branch,
          d.domain,
          d.learner_email,
          d.phone_number,
          d.why_join,
          d.github_url,
          d.linkedin_url,
          d.portfolio_url,
          d.other_links,
          d.certifications,
          d.projects,
          d.tier,
          d.payment_status,
          d.payment_id,
          d.interview_status,
        ];

        const result = db.run(sql, params);
        const resolved = result instanceof Promise ? await result : result;

        console.log(`[app] Application submitted (Local): ${d.registration_number} (${d.full_name})`);

        return res.status(201).json({
          message: "Application submitted successfully.",
          id: resolved.lastID,
        });
      }
    } catch (err) {
      // UNIQUE constraint violation — duplicate registration, email, or phone.
      const isDuplicate =
        err.code === "23505" ||                     // PostgreSQL / Supabase
        err.errcode === 2067 ||                     // node:sqlite unique violation
        (err.message && err.message.includes("UNIQUE constraint failed")) ||
        (err.message && err.message.includes("duplicate key value"));

      if (isDuplicate) {
        // Figure out which field was duplicated from the error message.
        let field = "registration number, email, or phone number";
        const msg = err.message || err.detail || "";
        if (msg.includes("registration_number")) field = "registration number";
        else if (msg.includes("learner_email")) field = "email";
        else if (msg.includes("phone_number")) field = "phone number";

        return res.status(409).json({
          error: `An application with this ${field} already exists. Contact the committee if that was not you.`,
          code: "DUPLICATE",
        });
      }

      console.error("[app] Submit error:", err);
      return res.status(500).json({
        error: "Something went wrong saving your application. Try again in a moment.",
      });
    }
  }
);

/* ------------------------------------------------------------------- check */

/**
 * Early duplicate lookup. The unique constraints on registration_number,
 * learner_email and phone_number reject at insert time, which is a miserable
 * place for an applicant to find out. This lets step 1 warn instead.
 *
 * Fails open on purpose: if the lookup breaks, the applicant is never blocked.
 * Returns only a boolean, so it leaks nothing about who has applied.
 */
router.get("/check/:regNo", checkLimiter, async (req, res) => {
  const regNo = String(req.params.regNo || "").trim();

  if (!/^\d{9,20}$/.test(regNo)) {
    return res.status(400).json({ error: "Invalid registration number." });
  }

  try {
    if (supabase) {
      const { count, error } = await supabase
        .from("applications")
        .select("registration_number", { count: "exact", head: true })
        .eq("registration_number", regNo);

      if (error) throw error;
      return res.json({ taken: (count ?? 0) > 0 });
    }

    const result = db.query(
      "SELECT 1 FROM applications WHERE registration_number = ? LIMIT 1",
      [regNo]
    );
    const { rows } = result instanceof Promise ? await result : result;
    return res.json({ taken: rows.length > 0 });
  } catch (err) {
    console.error("[app] Check error:", err);
    return res.json({ taken: false });
  }
});

export default router;
