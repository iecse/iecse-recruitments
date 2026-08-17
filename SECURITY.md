# Security

What is in place, what is deliberately not, and what still needs doing before
this is sent to a few hundred students.

The data at stake is a full name, a personal email, a phone number and a UPI
payment reference, for a real first year. That is the bar to keep in mind.

## Where secrets live

Nowhere in this repository, and nowhere in its history. Verified by scanning
the working tree and every commit for JWTs, `sb_secret_` keys, service role
strings and Postgres connection URLs. The only match is the
`sb_secret_...` placeholder in `supabase/.env.example`.

| Secret | Lives in | Ever reaches a browser |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | injected by Supabase in production, `supabase/.env.local` locally | no |
| `SUPABASE_URL` | same | no |
| `ALLOWED_ORIGINS` | `supabase secrets set` | no |
| `EXPORT_TOKEN` | `supabase secrets set`, and Apps Script script properties | no |

`supabase/.env.local` is gitignored. The frontend has no database client of
any kind: it posts to the Edge Function, which holds the credentials. There is no
`VITE_`-prefixed secret, because anything with that prefix is compiled into
the bundle and is therefore public by definition.

**The service role key must never be given to the frontend.** It bypasses row
level security. If a committee dashboard is built later, it gets its own
authenticated role and its own policy, not this key.

`EXPORT_TOKEN` is the committee's token, held by the Google Apps Script behind
the Sheet. It is the most sensitive thing after the service role key, because it
reads every applicant's name, email, phone number and payment reference in bulk
through `GET /export`.

It also authorises `POST /status`, which is how the Sheet writes payment and
interview decisions back. That route is deliberately the narrowest thing that
does the job: it sets `payment_status` or `interview_status`, to one of the
values in `WRITABLE_STATUS_FIELDS`, on a registration number that already
exists. It cannot insert, delete, or write any other column, and the patch is
built from the allowlist rather than from the request body, so an extra key in
the payload cannot reach the table.

Reusing one token for read and write was a deliberate trade. A leak of it
already meant every applicant's personal data; the increment is two enum flags
on rows that already exist, against the cost of a second secret that a student
committee has to keep in sync across a rotation. Both routes withhold CORS
headers, so no browser can call either whatever token it has.

Rotate it by setting `supabase secrets set EXPORT_TOKEN=...` and pasting the
same value into the Apps Script properties. They must match exactly, and
rotating one side only is the commonest reason the Sheet stops working; the
script's `diagnose` reports that case by name.

## Database

`supabase/schema.sql` creates the table with row level security on
and no policies, plus an explicit `revoke all` from `anon` and
`authenticated`. Default deny. The publishable key is a public value, so the
table has to be safe in the hands of anyone holding it.

Constraints are enforced in the schema as well as in the API: `check` on
`year`, `tier`, `payment_status` and `interview_status`, `unique` on
registration number, email and phone, and column widths that match the API's
own limits. A bug in the validation layer still cannot write a nonsense row.

Encryption at rest is Supabase's default (AES-256) and applies to the whole
database. There is no application level field encryption, and that is a
deliberate call: the committee reconciles payments by reading these rows in
the dashboard, so column level encryption would have to be reversible with a
key that is also on the server, which does not add much against the threat
that matters here. If that changes, `payment_id` and `phone_number` are the
columns to start with.

## Input

Every field is validated in `supabase/functions/_shared/validate.ts`, which is
authoritative and does not trust the client. Both it and the browser import
their patterns and bounds from `_shared/rules.ts`, so the two cannot drift:
change a rule once and both follow. This used to be two hand-synchronised
copies, which is how a form ends up passing locally and 400ing on send.

- Allowlisted values for `year`, `tier` and `domain`. Anything else is refused.
- Upper and lower bounds on every field, not just the free text ones. Without
  a ceiling, an anonymous endpoint lets a stranger choose how many bytes land
  in the table.
- Tags, stray angle brackets and control characters are stripped from every
  string before storage, so nothing reaching the database can be markup.
- `payment_status` and `interview_status` are derived on the server and
  overwritten regardless of what the client sends. The insert is built from an
  allowlist of keys, so extra fields in the request body are dropped rather
  than passed through.
- No SQL is built by string concatenation anywhere. Writes go through the
  Supabase client, which parameterises, and the one hand written function
  (`bump_rate_limit`) takes typed arguments.

React escapes interpolated content by default and nothing in the app uses
`dangerouslySetInnerHTML`, so stored values cannot become markup on the way
back out either.

## Rate limiting

Per IP, and IP is the weak part: campus wifi puts hundreds of students behind
a handful of NAT addresses, so a limit keyed on IP is really keyed on
"everyone in that building". Limits are set to stop bulk junk while staying
far out of reach of a person filling the form honestly.

| Scope | Limit |
| --- | --- |
| Submissions | 40 / 15 minutes |
| Duplicate lookups | 30 / minute |

The counter lives in Postgres, not in memory, because an edge function is
stateless and runs in as many instances as Supabase decides. A counter in a
module variable would limit one instance and nothing else.

**`supabase/rate-limit.sql` must actually have been run.** Without it the RPC
does not exist, the limiter fails open, and there is no rate limiting at all.
It fails open on purpose, since a broken limiter must never stop somebody
applying, but it logs `RATE LIMITING IS NOT ACTIVE` loudly when it does. Check
the function logs after deploying.

Addresses are hashed before storage. Rate limiting does not need to know who
anyone is, and a table of IP addresses beside a table of student names is worse
to hold than either alone.

## Transport and headers

The Edge Function sets `nosniff` and `no-store` on every response and handles
CORS explicitly, allowing only origins named in `ALLOWED_ORIGINS` plus the dev
ports. Supabase terminates TLS in front of it.

The static frontend carries its own header config: `firebase.json` for Firebase
Hosting and `public/_headers` for Cloudflare Pages or Netlify. Both set the same
list. Change one, change the other, and verify after deploying with
`curl -sI https://apply.iecse-manipal.com`. The policy is:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Content-Security-Policy: default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;
  connect-src 'self' https://*.supabase.co; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; object-src 'none'
```

`script-src` has no `'unsafe-inline'`: the Vite build emits no inline scripts,
checked against `dist/index.html`. `style-src` does need it, because React sets
element style attributes in five places. `connect-src` must reach Supabase or
every submission is blocked by the browser before it leaves.

`ALLOWED_ORIGINS` on the function must then name the deployed origin. Localhost
dev ports are always allowed and do not need listing.

## Dependencies

`npm audit` reports zero vulnerabilities in the frontend. Re-run before each
deploy; it is one command and the cheapest check here.

```bash
npm audit --omit=dev
```

The Edge Function has one dependency, `@supabase/supabase-js`, pinned in
`supabase/functions/deno.json`.

## Not applicable

There are no user accounts, no passwords, no sessions and no cookies, so
password hashing, session cookie flags and login rate limiting have nothing to
apply to. There are no file uploads. Should a committee login ever be added,
that is the point at which all four come back and none of them should be
hand rolled, use Supabase Auth.

## Known gaps

**Bot protection is only the cheap half.** A hidden field and a minimum fill
time refuse scripted posting, and both are checked server side before anything
touches the database. Neither stops somebody who opens the page first and
scripts against what they see; they are there because they cost an applicant
nothing, not because they are sufficient. Turnstile on the submit step is the
real answer and is not done: it needs `script-src https://challenges.cloudflare.com`
in the CSP, which is a deliberate widening of something currently set to `'self'`.

**Squatting is the threat that matters, not junk rows.** Registration number,
email and phone are all unique, and the duplicate check endpoint says which
numbers are free, so a script can lock real students out by applying under
their numbers. Prevention is never total, so the important part is that it is
recoverable: the duplicate message names an address to write to, and RUNBOOK.md
tells whoever is on duty how to identify a junk row and delete it. If clashes
start arriving in bursts rather than one at a time, that is an attack, not
coincidence.

**The duplicate check is an enumeration oracle.** `GET
/applications/check/:regNo` answers whether a registration number has
applied. Registration numbers are sequential, so at 30 lookups a minute
somebody could work out who in their year has applied to the club. It exists
so an applicant does not fill five screens before being told they already
applied, which is a real kindness. The trade is deliberate but it is a trade,
and if it is not worth it, delete the route and the client call in
`src/api.js`.

**Drafts hold personal data in `localStorage` in plain text**, name, email,
phone and registration number, so the form survives a refresh. It is cleared
on successful submit, but on a shared lab machine an abandoned draft persists.
Anyone who does not finish should use `Clear draft`.

**No confirmation email and no reference number.** An applicant who closes the
tab has no proof they applied and no way to check.
