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

Nothing here needs a global install. `npx` fetches the CLIs.

### Where each step runs

| Step | Where |
| --- | --- |
| The two SQL files | Supabase dashboard, SQL Editor, in a browser. Not a terminal. |
| `supabase ...` | Any terminal, in the repo root |
| `npm run build` | Any terminal, in the repo root |
| `firebase ...` | Any terminal, in the repo root |
| DNS record | Wherever iecse-manipal.com is managed |

The project ref is in the dashboard URL, or Project Settings, General,
Reference ID.

### 1. Database

In the SQL Editor, open a new query, paste the contents of `supabase/schema.sql`,
run it. Then the same for `supabase/rate-limit.sql`. Order matters.

Skipping the second one does not fail loudly at deploy time. It fails at
runtime by disabling rate limiting entirely, and the only sign is a
`RATE LIMITING IS NOT ACTIVE` line in the function logs.

Then verify, because row level security is easy to believe you have enabled:

```sql
select relname, relrowsecurity from pg_class where relname = 'applications';
select policyname from pg_policies where tablename = 'applications';
```

Expect `true`, and zero policies. Zero policies under RLS is what denies
everything that is not the function.

### 2. The API

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <your-ref>
```

```bash
npx supabase secrets set ALLOWED_ORIGINS=https://apply.iecse-manipal.com
```

```bash
npx supabase functions deploy applications --no-verify-jwt
```

`--no-verify-jwt` is not optional. Applicants are anonymous, so there is no
token to present; without it every submission is rejected before it reaches any
of the validation. The function is still not open: it validates everything,
rate limits per address, and writes to exactly one table.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase. Do not
set them as secrets.

### 3. The page

Copy `.env.production.example` to `.env.production` and put the real ref in it.
Then:

```bash
npm run build
```

Use the file rather than `VITE_API_BASE=... npm run build`. That form is bash
only and silently does nothing in PowerShell: the build succeeds, the variable
is unset, and the deployed page calls `/api`, which does not exist on a static
host. Every submission 404s and the page gives no clue why.

Deploy `dist/` to any static host. On Firebase, in the same project as the club
site:

```bash
npx firebase login
```

```bash
npx firebase hosting:sites:create iecse-apply
```

```bash
npx firebase deploy --only hosting
```

### 4. DNS

Point `apply.iecse-manipal.com` at the host, using whatever CNAME or A record
it gives you. This is the one step with no command here: it happens wherever
the domain is managed.

Until it exists, the club site's Register button points at nothing.

### 5. Check it, do not assume it

```bash
curl -sI https://apply.iecse-manipal.com | grep -iE "content-security|strict-transport"
```

Then submit one real application, confirm the row lands, and delete it. Read
the function logs for `RATE LIMITING IS NOT ACTIVE`; if it is there, step 1 did
not take.

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
