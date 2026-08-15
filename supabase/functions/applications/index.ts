/**
 * The recruitment API, as a Supabase Edge Function.
 *
 *   POST /applications              submit
 *   GET  /applications/check/:regNo has this registration number applied
 *   GET  /applications/health       liveness
 *
 * Replaces the Express server for production. That server still exists for
 * local development against SQLite, but this is what applicants reach, and the
 * two share their rules through _shared/rules.ts so they cannot drift.
 *
 * This runs with the service role key, which Supabase injects, and which
 * bypasses row level security. That is why the table denies anon and
 * authenticated everything: the browser has no path to it except through here.
 */

import { createClient } from "@supabase/supabase-js";
import { validateApplication } from "../_shared/validate.ts";
import { PATTERNS, REGISTRATION_DIGITS } from "../_shared/rules.ts";

/**
 * Origins allowed to call this. Set ALLOWED_ORIGINS as a comma separated list.
 * Left unset, only localhost works, which fails closed rather than open.
 */
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)
  .concat([
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:4173",
  ]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

const json = (
  body: unknown,
  status: number,
  origin: string | null,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(origin),
    },
  });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * Rate limiting, in Postgres rather than in memory.
 *
 * An edge function is stateless and runs in as many instances as it likes, so
 * a counter in a module variable limits one instance and nothing else. The
 * table is the only place all instances can agree.
 *
 * The caller's address is hashed before storage: rate limiting does not need
 * to know who anyone is, and a table of IP addresses beside a table of student
 * names is a worse thing to hold than either alone.
 *
 * Fails open. If the limiter itself breaks, applicants still get to apply.
 */
async function overLimit(
  req: Request,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      "unknown";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${bucket}:${ip}`),
    );
    const key = Array.from(new Uint8Array(digest))
      .slice(0, 16)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { data, error } = await admin.rpc("bump_rate_limit", {
      p_key: key,
      p_window_seconds: windowSeconds,
    });
    if (error) return false;
    return typeof data === "number" && data > max;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const url = new URL(req.url);
  // Supabase serves this at /functions/v1/applications, and the client calls
  // it at <base>/applications/... , so match on the tail rather than the whole.
  const path = url.pathname.replace(/^.*\/applications/, "") || "/";

  try {
    /* ---------------------------------------------------------- health */
    if (req.method === "GET" && path === "/health") {
      return json({ status: "ok", timestamp: new Date().toISOString() }, 200, origin);
    }

    /* ----------------------------------------------------------- check */
    if (req.method === "GET" && path.startsWith("/check/")) {
      const regNo = decodeURIComponent(path.slice("/check/".length)).trim();

      if (
        !PATTERNS.digitsOnly.test(regNo) ||
        regNo.length !== REGISTRATION_DIGITS
      ) {
        return json({ error: "Invalid registration number." }, 400, origin);
      }

      if (await overLimit(req, "check", 30, 60)) {
        return json({ error: "Too many lookups. Please slow down." }, 429, origin);
      }

      const { count, error } = await admin
        .from("applications")
        .select("registration_number", { count: "exact", head: true })
        .eq("registration_number", regNo);

      // Fails open: a broken lookup must never stop somebody applying.
      if (error) return json({ taken: false }, 200, origin);
      return json({ taken: (count ?? 0) > 0 }, 200, origin);
    }

    /* ---------------------------------------------------------- submit */
    if (req.method === "POST" && (path === "/" || path === "")) {
      // Generous, because campus wifi puts a whole building behind one
      // address. Enough to stop bulk junk, never reachable by a real applicant.
      if (await overLimit(req, "submit", 40, 15 * 60)) {
        return json(
          {
            error:
              "That is a lot of submissions from this network. Wait a few minutes and try again, or tell the committee.",
          },
          429,
          origin,
        );
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Malformed request." }, 400, origin);
      }

      const { valid, errors, cleaned } = validateApplication(body);
      // Narrowed rather than asserted with !, so a future change to
      // validateApplication that forgets to build a row is a type error here
      // instead of an insert of null at runtime.
      if (!valid || !cleaned) {
        return json({ error: "Validation failed", fields: errors }, 400, origin);
      }

      const { data, error } = await admin
        .from("applications")
        .insert([cleaned])
        .select("id")
        .single();

      if (error) {
        // 23505 is a unique violation: registration number, email or phone.
        if (error.code === "23505") {
          const detail = `${error.message} ${error.details ?? ""}`;
          let field = "registration number, email, or phone number";
          if (detail.includes("registration_number")) field = "registration number";
          else if (detail.includes("learner_email")) field = "email";
          else if (detail.includes("phone_number")) field = "phone number";

          return json(
            {
              error:
                `An application with this ${field} already exists. Contact the committee if that was not you.`,
              code: "DUPLICATE",
            },
            409,
            origin,
          );
        }

        console.error("[app] insert failed:", error.message);
        return json(
          {
            error:
              "Something went wrong saving your application. Try again in a moment.",
          },
          500,
          origin,
        );
      }

      console.log(`[app] submitted: ${cleaned.registration_number}`);
      return json(
        { message: "Application submitted successfully.", id: data?.id ?? null },
        201,
        origin,
      );
    }

    return json({ error: "Not found" }, 404, origin);
  } catch (err) {
    // Never let an internal message reach the applicant.
    console.error("[app] unhandled:", err);
    return json({ error: "Internal server error" }, 500, origin);
  }
});
