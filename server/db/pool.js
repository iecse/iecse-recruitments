/**
 * Database connection layer.
 *
 * Uses the built in node:sqlite for local development (zero setup). In
 * production,
 * set DATABASE_URL to a PostgreSQL connection string and this module
 * will use the `pg` pool instead.
 *
 * Both drivers expose the same interface:
 *   db.query(sql, params) → { rows }
 *   db.run(sql, params)   → { lastID, changes }
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { supabase } from "./supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db;

if (supabase) {
  /* ---- Supabase owns storage; this layer is unused ---- */
  // Without this branch the SQLite client still opened, which created a stray
  // database file next to a production deployment and printed a boot line
  // saying SQLite was in use while every write went to Supabase. Nothing calls
  // db in this configuration, so it throws rather than pretending to work.
  const unused = () => {
    throw new Error("Supabase is configured; the SQL layer is not in use.");
  };
  db = { query: unused, run: unused, close: () => {} };
} else if (process.env.DATABASE_URL) {
  /* ---- PostgreSQL (production) ---- */
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const toPg = (sql) => {
    let i = 1;
    let pgSql = sql.replace(/\?/g, () => `$${i++}`);
    // If it's an INSERT without RETURNING, append RETURNING id
    if (/^\s*INSERT\s/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
      pgSql += " RETURNING id";
    }
    return pgSql;
  };

  db = {
    query: (sql, params) => pool.query(toPg(sql), params),
    run: async (sql, params) => {
      const result = await pool.query(toPg(sql), params);
      return { lastID: result.rows?.[0]?.id, changes: result.rowCount };
    },
    close: () => pool.end(),
  };

  console.log("[db] Connected to PostgreSQL");
} else {
  /* ---- SQLite (local dev, zero setup) ---- */
  // node:sqlite ships with Node itself. better-sqlite3 was a native module
  // with no prebuilt binary for current Node, so a plain `npm install` failed
  // on any machine without a C++ toolchain. Same API surface for what this
  // uses: prepare/all/run, run returning { changes, lastInsertRowid }.
  const { DatabaseSync } = await import("node:sqlite");
  const dbPath = path.join(__dirname, "iecse_recruitment.db");
  const sqlite = new DatabaseSync(dbPath);

  // WAL for better concurrent read performance.
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");

  // Run schema if tables don't exist yet.
  const schemaPath = path.join(__dirname, "schema.sql");
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, "utf-8");
    sqlite.exec(schema);
  }

  db = {
    query: (sql, params = []) => {
      const stmt = sqlite.prepare(sql);
      const rows = stmt.all(...params);
      return { rows };
    },
    run: (sql, params = []) => {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...params);
      return { lastID: info.lastInsertRowid, changes: info.changes };
    },
    close: () => sqlite.close(),
  };

  console.log(`[db] Using SQLite at ${dbPath}`);
}

export default db;
