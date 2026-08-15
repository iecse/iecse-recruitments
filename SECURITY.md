# Security

What is in place, what is deliberately not, and what still needs doing before
this is sent to a few hundred students.

The data at stake is a full name, a personal email, a phone number and a UPI
payment reference, for a real first year. That is the bar to keep in mind.

## Where secrets live

Nowhere in this repository, and nowhere in its history. Verified by scanning
the working tree and every commit for JWTs, `sb_secret_` keys, service role
strings and Postgres connection URLs. The only match is the
`postgresql://user:pass@host` placeholder in `server/.env.example`.

| Secret | Lives in | Ever reaches a browser |
| --- | --- | --- |
| `SUPABASE_KEY` (service role) | `server/.env` | no |
| `SUPABASE_URL` | `server/.env` | no |
| `DATABASE_URL` | `server/.env` | no |

`server/.env` is gitignored. The frontend has no database client of any kind:
it posts to `/api` and the server holds the credentials. There is no
`VITE_`-prefixed secret, because anything with that prefix is compiled into
the bundle and is therefore public by definition.

**The service role key must never be given to the frontend.** It bypasses row
level security. If a committee dashboard is built later, it gets its own
authenticated role and its own policy, not this key.

## Database

`server/db/supabase-schema.sql` creates the table with row level security on
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

Every field is validated server side in `server/middleware/validate.js`, which
is authoritative and does not trust the client. `src/lib/validation.js` mirrors
it so applicants find out on the step that owns the field rather than at
submit. **If you change a rule, change both**, or the form passes locally and
400s on send.

- Allowlisted values for `year`, `tier` and `domain`. Anything else is refused.
- Upper and lower bounds on every field, not just the free text ones. Without
  a ceiling, an anonymous endpoint lets a stranger choose how many bytes land
  in the table, up to the 1mb body limit.
- HTML is stripped from every string with `sanitize-html` before storage, so
  nothing that reaches the database can be markup.
- `payment_status` and `interview_status` are derived on the server and
  overwritten regardless of what the client sends. The insert is built from an
  allowlist of keys, so extra fields in the request body are dropped rather
  than passed through.
- Queries are parameterised. `server/db/pool.js` converts `?` placeholders to
  `$n` for Postgres; no SQL is built by string concatenation anywhere.

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
| All endpoints | 300 / minute |
| Submissions | 40 / 15 minutes |
| Duplicate lookups | 30 / minute |

Two traps worth knowing about, both of which silently disable the limiter:

- **`TRUST_PROXY` must match the deployment.** It defaults to `0`. Trusting a
  proxy that is not there means `req.ip` comes from the `X-Forwarded-For`
  header, which the client sends, so anyone can present a fresh identity on
  every request. Set it to the number of proxies actually in front of the app.
- **Do not add a custom `keyGenerator`.** The library's own normalises IPv6 to
  a /56 block. One that returns `req.ip` raw looks equivalent and is not: a
  single IPv6 allocation hands out more addresses than the limiter can count.

## Transport and headers

`helmet` is applied to the API, which sets HSTS, `nosniff`, frame denial and
referrer policy, and removes `x-powered-by`.

**The static frontend needs the same treatment at its host, and does not have
it yet**, because the deploy target is not decided. Whatever it lands on needs:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; img-src 'self' data:;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'
```

`CORS_ORIGINS` on the API must then list that origin. Localhost dev ports are
always allowed and do not need listing.

## Dependencies

`npm audit` reports zero vulnerabilities in both the frontend and the server.
Re-run before each deploy; it is two commands and it is the cheapest check
here.

```bash
npm audit --omit=dev
cd server && npm audit
```

## Not applicable

There are no user accounts, no passwords, no sessions and no cookies, so
password hashing, session cookie flags and login rate limiting have nothing to
apply to. There are no file uploads. Should a committee login ever be added,
that is the point at which all four come back and none of them should be
hand rolled — use Supabase Auth.

## Known gaps

**No bot protection.** Rate limiting is all there is. A script that rotates
addresses can still submit junk, and nothing here would stop it. The reason to
care is not the rows, it is the committee reconciling them by hand. Turnstile
or hCaptcha on the submit step is the fix and it is not done.

**The duplicate check is an enumeration oracle.** `GET
/api/applications/check/:regNo` answers whether a registration number has
applied. Registration numbers are sequential, so at 30 lookups a minute
somebody could work out who in their year has applied to the club. It exists
so an applicant does not fill five screens before being told they already
applied, which is a real kindness. The trade is deliberate but it is a trade,
and if it is not worth it, delete the route and the client call in
`src/api.js`.

**Drafts hold personal data in `localStorage` in plain text** — name, email,
phone and registration number, so the form survives a refresh. It is cleared
on successful submit, but on a shared lab machine an abandoned draft persists.
Anyone who does not finish should use `Clear draft`.

**No confirmation email and no reference number.** An applicant who closes the
tab has no proof they applied and no way to check.
