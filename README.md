# IECSE Recruitment

The application page for IECSE, the computer science club at MIT Manipal.

Five steps, saved as you go. Applications go to an Express API which writes to
SQLite, PostgreSQL or Supabase depending on how it is configured. The committee
reconciles rows by hand.

## Running it

Two processes. Both need to be up: the frontend proxies `/api` to the server.

```bash
npm install && npm run dev
```

```bash
cd server && npm install && npm run dev
```

The frontend comes up on 5173 (or the next free port, `autoPort` is on) and the
API on 3001. With no configuration at all the server writes to a SQLite file at
`server/db/iecse_recruitment.db`, created on first run. Nothing else is needed
to work on the form locally.

## Configuration

There is no frontend `.env`. Every secret lives on the server.

Copy `server/.env.example` to `server/.env` and fill in what you need. It is
gitignored. Storage is picked in this order:

1. `SUPABASE_URL` + `SUPABASE_KEY` — writes through the Supabase REST API. Use
   the **service role** key, not the publishable one: this runs server side, and
   the service role is what lets the duplicate lookup read the table without
   opening it to the public anon role.
2. `DATABASE_URL` — PostgreSQL. Run `npm run init:pg` inside `server/` once to
   create the table and indexes.
3. Neither — SQLite, as above.

Also read: `PORT` (default 3001) and `CORS_ORIGINS`, a comma separated list of
production origins allowed to call the API. Localhost dev ports are always
allowed and do not need listing.

## API

```
POST /api/applications              submit; 201, or 400 { error, fields }, or 409 { error, code }
GET  /api/applications/check/:regNo { taken: boolean }, fails open
GET  /api/health                    { status, timestamp }
```

Server-side validation in `server/middleware/validate.js` is authoritative and
does not trust the client. `src/lib/validation.js` mirrors its rules so an
applicant finds out on the step that owns the field rather than at submit. If
you change a rule, change both, or the form will pass locally and 400 on send.

Rate limits per IP: 100 requests/minute globally, 3 submissions/hour, 10
duplicate lookups/minute.

## Building

```bash
npm run build
```

Deploys to its own subdomain and is served from the root. If it ever moves under
a path, set `VITE_BASE` (for example `VITE_BASE=/apply/`). The API is deployed
separately; put its origin in `CORS_ORIGINS` and point `/api` at it.

## Before changing anything

- [DESIGN.md](DESIGN.md) records what was decided and why, including a list of
  things that were deliberately rejected. Read it before reintroducing one.
- [TODO.md](TODO.md) lists what is still outstanding, ordered by what blocks
  shipping.

## Stack

Vite, React 19, Tailwind v4, and a three.js backdrop that is lazy loaded and
desktop only. Server is Express 5 on Node, using the built in `node:sqlite`, so
there is no native module to compile — Node 22.5 or newer is required.

`npx eslint .` should exit clean.
