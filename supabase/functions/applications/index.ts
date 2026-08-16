/**
 * The recruitment API, as a Supabase Edge Function.
 *
 *   POST /applications              submit
 *   GET  /applications/check/:regNo has this registration number applied
 *   GET  /applications/health       liveness
 *
 * This is the only implementation. `npm run dev:api` runs this same file
 * locally through Deno, so development and production execute the same code
 * rather than two versions kept in agreement by hand.
 *
 * This runs with the service role key, which Supabase injects, and which
 * bypasses row level security. That is why the table denies anon and
 * authenticated everything: the browser has no path to it except through here.
 */

// Fully qualified on purpose. A bare specifier needs an import map, and the
// deploy bundler uploads only the function's own .ts files: deno.json does not
// go with them, so the bare form resolves locally and fails at deploy time.
import { createClient } from "jsr:@supabase/supabase-js@^2.112.3";
import { validateApplication } from "../_shared/validate.ts";
import { PATTERNS, REGISTRATION_DIGITS } from "../_shared/rules.ts";

/**
 * Origins allowed to call this. ALLOWED_ORIGINS is a comma separated list.
 *
 * Read per request, not once at module load. A module level constant is only
 * re-read when an instance restarts, so changing the secret appears to do
 * nothing until something happens to recycle the function, which is a
 * miserable thing to debug at the point where nobody can submit.
 *
 * Firebase serves every site on a .web.app domain as well as any custom one,
 * and the custom domain usually arrives days later. Both are allowed by
 * default so the deployment is testable before DNS exists.
 */
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "https://iecse-apply.web.app",
  "https://iecse-apply.firebaseapp.com",
  "https://apply.iecse-manipal.com",
];

function allowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .concat(DEFAULT_ORIGINS);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };

  // Only echo an origin that is actually allowed. Echoing the first entry of
  // the list instead produced "has a value X that is not equal to the supplied
  // origin", which reads like the server is misconfigured rather than like the
  // caller is not on the list.
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
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

    if (error) {
      // Failing open is deliberate, but failing open quietly is how you end up
      // with no rate limiting in production and no way to know. The usual
      // cause is supabase/rate-limit.sql never having been run.
      warnLimiterBroken(error.message);
      return false;
    }

    return typeof data === "number" && data > max;
  } catch (err) {
    warnLimiterBroken(String(err));
    return false;
  }
}

/**
 * Compares without leaking length or position through timing. Overkill for a
 * token this long, but the alternative is a === that returns on the first
 * differing byte, and that is a habit worth not having.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

let limiterWarned = false;

/** Once per instance. A warning per request would bury the log. */
function warnLimiterBroken(reason: string) {
  if (limiterWarned) return;
  limiterWarned = true;
  console.error(
    `[app] RATE LIMITING IS NOT ACTIVE: ${reason}. ` +
      `Run supabase/rate-limit.sql in this project. Requests are being served ` +
      `without a limit until it exists.`,
  );
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

    /* ---------------------------------------------------------- export */
    /**
     * Every row, for the committee's Google Sheet.
     *
     * This is the one endpoint that hands out personal data in bulk: names,
     * emails, phone numbers and payment references for every applicant. It is
     * gated on a bearer token set with `supabase secrets set EXPORT_TOKEN=...`,
     * and if that secret is missing the route does not exist rather than
     * running open.
     *
     * Deliberately not CORS enabled. The caller is Google Apps Script, which
     * is server side; no browser should ever be able to reach this, and
     * withholding the header means a page that tries cannot read the reply.
     */
    if (req.method === "GET" && path === "/export") {
      const expected = Deno.env.get("EXPORT_TOKEN")?.trim();
      if (!expected) {
        console.error("[app] export requested but EXPORT_TOKEN is not set");
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }

      const presented = (req.headers.get("authorization") ?? "")
        .replace(/^Bearer /i, "")
        .trim();

      if (!timingSafeEqual(presented, expected)) {
        console.warn("[app] export rejected: bad token");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }

      if (await overLimit(req, "export", 30, 60 * 60)) {
        return new Response(JSON.stringify({ error: "Too many exports." }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }

      const { data, error } = await admin
        .from("applications")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[app] export failed:", error.message);
        return new Response(JSON.stringify({ error: "Export failed." }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }

      console.log(`[app] export served: ${data?.length ?? 0} rows`);
      return new Response(
        JSON.stringify({ rows: data ?? [], exported_at: new Date().toISOString() }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
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
