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

## Deploying

Three pieces, and only one of them is the static page.

**The API is a Supabase Edge Function**, in `supabase/functions/applications`.
It replaces the Express server in production; that server stays for local
development against SQLite. Both read their rules from
`supabase/functions/_shared/rules.ts`, so the two cannot disagree about what is
valid.

Once, in the club's Supabase project:

```
supabase link --project-ref <ref>
```

Run `server/db/supabase-schema.sql` then `supabase/rate-limit.sql` in the SQL
editor. The second one is what makes rate limiting work: an edge function is
stateless and runs in as many instances as it likes, so a counter in memory
limits one instance and nothing else.

Then:

```
supabase secrets set ALLOWED_ORIGINS=https://apply.iecse-manipal.com
supabase functions deploy applications --no-verify-jwt
```

`--no-verify-jwt` is required. Applicants are anonymous; there is no login and
no token to present. The function is still not open season: it validates
everything, rate limits per address, and only ever writes to one table.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase, so
they are not secrets you set.

**The static page** goes on any static host. Build it with the API's origin
baked in:

```
VITE_API_BASE=https://<ref>.supabase.co/functions/v1 npm run build
```

Without that the app calls `/api`, which only exists behind the Vite dev
proxy. On a static host every request would 404 against the page itself.

That origin must also appear in `ALLOWED_ORIGINS` above, or the browser blocks
the response at the CORS check.

**Security headers** are not applied by any of this. Whatever hosts the static
build needs them set there; the list is in SECURITY.md.

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
