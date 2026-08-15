/**
 * IECSE Recruitment — Express backend.
 *
 * Serves the application API at /api. In development, Vite proxies
 * /api requests to this server. In production, host this behind nginx
 * or deploy as-is.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { globalLimiter } from "./middleware/rateLimit.js";
import applicationRoutes from "./routes/applications.js";

const PORT = process.env.PORT || 3001;
const app = express();

/* ---- proxy configuration ---- */
// Required for express-rate-limit if hosted behind Nginx, Render, Vercel, etc.
app.set("trust proxy", 1);

/* ---- security ---- */
app.use(helmet());
// Dev origins are always allowed. Production origins come from CORS_ORIGINS,
// a comma separated list, because the deployed subdomain is not knowable here
// and a hardcoded localhost list fails the moment this ships.
const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
];

const allowedOrigins = [
  ...DEV_ORIGINS,
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

app.use(
  cors({
    // No Origin header means a same-origin request or a direct curl. Both are
    // fine; CORS is not the thing standing between this API and abuse.
    origin: (origin, callback) =>
      !origin || allowedOrigins.includes(origin)
        ? callback(null, true)
        : callback(new Error("Not allowed by CORS")),
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

/* ---- parsing ---- */
app.use(express.json({ limit: "1mb" }));

/* ---- rate limiting (global) ---- */
app.use(globalLimiter);

/* ---- routes ---- */
app.use("/api/applications", applicationRoutes);

/* ---- health check ---- */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* ---- 404 catch-all ---- */
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

/* ---- global error handler ---- */
app.use((err, _req, res, _next) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

/* ---- start ---- */
app.listen(PORT, () => {
  console.log(`\n  IECSE Recruitment API`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Health: http://localhost:${PORT}/api/health\n`);
});
