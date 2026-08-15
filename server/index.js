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
// How many proxies sit in front of this, from TRUST_PROXY. Default 0.
//
// This is not a formality. Trusting a proxy that is not there means req.ip is
// taken from the X-Forwarded-For header, which the client sends, so anyone can
// hand the rate limiter a fresh identity on every request and the limits stop
// existing. It was hardcoded to 1; if this ever ran without exactly one proxy
// in front, that was a silent bypass. Set TRUST_PROXY to match the deployment,
// and leave it alone if you are not sure.
const trustProxy = Number.parseInt(process.env.TRUST_PROXY ?? "0", 10);
app.set("trust proxy", Number.isNaN(trustProxy) ? 0 : trustProxy);

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
