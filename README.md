# IECSE Recruitment

The application page for IECSE, the computer science club at MIT Manipal.

Five steps, saved as you go. Applications go to an Express API which writes to
SQLite, PostgreSQL or Supabase depending on how it is configured. The committee
reconciles rows by hand.

## Running it

Two processes. The page proxies `/api` to the function, so both must be up.

```bash
npm install && npm run dev
```

```bash
npm run dev:api
```

`dev:api` runs the Supabase Edge Function locally through Deno, on port 8000.
This is the same file that runs in production, not a second implementation of
it, so anything that works locally works deployed and anything broken is broken
in both. It needs Deno on PATH and `supabase/.env.local` filled in; copy
`supabase/.env.example` and take both values from Project Settings, API.

There is no local database. The function talks to the real Supabase project,
so be aware you are writing real rows while developing.

## Configuration

There is no frontend `.env` holding secrets, and there must never be: anything
`VITE_` prefixed is compiled into the bundle and is public.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_BASE` | frontend build | Absolute origin of the deployed function. Defaults to `/api` for the dev proxy. |
| `SUPABASE_URL` | injected in production | Set locally in `supabase/.env.local`. |
| `SUPABASE_SERVICE_ROLE_KEY` | injected in production | Set locally in `supabase/.env.local`. Bypasses row level security. |
| `ALLOWED_ORIGINS` | `supabase secrets set` | Comma separated origins allowed to call the function. |

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

Run `supabase/schema.sql` then `supabase/rate-limit.sql` in the SQL editor. The second one is what makes rate limiting work: an edge function is
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
