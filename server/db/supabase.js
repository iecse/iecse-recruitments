/**
 * The Supabase client, and the decision about whether to use one.
 *
 * This lives on its own because getting it wrong is silent. The previous
 * version built the client inline with
 *
 *   if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) { ... }
 *
 * so a project configured with the name Supabase actually prints,
 * SUPABASE_SECRET_KEY, produced no client, no warning, and a server that
 * cheerfully wrote every application to a local SQLite file instead. Nobody
 * finds out until the committee opens an empty table.
 *
 * Key naming: Supabase's current dashboard issues sb_publishable_... and
 * sb_secret_... . Older projects have anon and service_role JWTs. Both are
 * accepted here under either variable name.
 *
 * The secret key bypasses row level security. It is server side only and must
 * never reach a browser or a VITE_ prefixed variable.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.trim();

// SUPABASE_KEY is the older name this project used. Both work.
const secretKey =
  process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_KEY?.trim();

/**
 * A publishable key here is a configuration mistake, not a lesser option: it
 * is subject to row level security, and the schema denies that role
 * everything, so every insert would fail at runtime rather than at boot.
 */
function looksPublishable(key) {
  return key.startsWith("sb_publishable_");
}

if (url && !secretKey) {
  console.error(
    "\n[db] SUPABASE_URL is set but no secret key was found.\n" +
      "     Expected SUPABASE_SECRET_KEY (or SUPABASE_KEY).\n" +
      "     Refusing to start rather than silently writing to SQLite.\n"
  );
  process.exit(1);
}

if (url && secretKey && looksPublishable(secretKey)) {
  console.error(
    "\n[db] The Supabase key provided is a publishable key.\n" +
      "     The server needs the secret key (sb_secret_... or service_role).\n" +
      "     A publishable key is blocked by row level security, so every\n" +
      "     insert would fail once applicants started arriving.\n"
  );
  process.exit(1);
}

if (!url && secretKey) {
  console.warn(
    "[db] A Supabase key is set but SUPABASE_URL is not. Ignoring both."
  );
}

export const supabase =
  url && secretKey
    ? createClient(url, secretKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

/** Printed at boot so the storage in use is never a guess. */
export function describeStorage() {
  if (supabase) return `Supabase at ${url}`;
  if (process.env.DATABASE_URL) return "PostgreSQL via DATABASE_URL";
  return "SQLite at server/db/iecse_recruitment.db (local only)";
}
