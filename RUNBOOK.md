# Runbook

For whoever is on duty while applications are open. Written for someone who did
not build this.

Everything here needs access to the Supabase dashboard for the RECRUITEMENTS
project, and most of it happens in the SQL Editor.

## Someone cannot apply: "an application already exists"

The likeliest cause is boring: they already applied and forgot, or a friend
used their number by mistake. The unpleasant cause is that somebody submitted
junk under their registration number, which locks them out, because
registration number, email and phone are all unique.

**Do not assume either. Look first.**

```sql
select id, created_at, full_name, registration_number, learner_email,
       phone_number, tier, payment_id
from public.applications
where registration_number = 'THEIR_NUMBER';
```

If the row is plainly theirs, tell them so; they are done.

If it is not theirs, a name they do not recognise, a nonsense email, a payment
reference that matches nothing in the club account, delete it so they can
apply:

```sql
delete from public.applications where id = THE_ID;
```

Note the id before deleting. If several arrive at once, that is a pattern worth
telling whoever maintains this, not a series of one-off deletions.

The same applies when the clash is on email or phone: change the `where` to
`learner_email` or `phone_number`.

## Someone says the form rejected them and they are not a robot

The API refuses submissions that look automated. It says only "that submission
could not be accepted", on purpose, because a specific reason is a hint to
whoever is trying to get past it.

Two things trigger it:

- a hidden field was filled, which no person can do by hand
- the application was completed in under 20 seconds, measured from when their
  draft was first created, not from page load

A real applicant hits the second only by pasting a saved draft into a fresh
browser and submitting instantly. Ask them to reload and try again.

The function logs the actual reason. In the Supabase dashboard, Edge Functions,
`applications`, Logs, look for `submission refused as automated`.

## Marking a payment as received

Do it in the Sheet. Change the Payment cell to `verified` and it saves to the
database as you make the change. The cell is a dropdown, so the only options are
the ones the database accepts.

Unreconciled rows are tinted pink, so `pending` is what to work through.

If a write fails, the cell gets a note saying why, and the next refresh puts the
cell back to whatever the database actually holds. A cell that silently reverts
means the write did not land: read the note, or run `diagnose`.

This needs the write-back trigger installed. `diagnose` reports whether it is;
`installAutoRefresh` installs it along with the scheduled refresh.

The Interview column works the same way, with `pending`, `not_required`,
`scheduled` and `done`.

The database is still the source of truth. The Sheet edit is a request to change
it, and the refresh reads back what actually stuck, so the two cannot drift.

SQL still works if you prefer it, or if the Sheet is broken:

```sql
update public.applications
set payment_status = 'verified'
where registration_number = 'THEIR_NUMBER';
```

Allowed values are `pending`, `verified` and `rejected`. The schema enforces
that, so a typo fails rather than writing a status nothing reads.

## Interview status

Members are `not_required`. Working and Management Committee start `pending`.
Change the Interview cell in the Sheet as you schedule and complete, the same
way as Payment above. Allowed: `pending`, `not_required`, `scheduled`, `done`.

## The Sheet is not updating

Do not guess. In the Apps Script editor, run `diagnose` from the function
dropdown and read View, Logs. It checks each cause in the order it can fail and
names the one it is. The three it distinguishes:

1. Nobody ran the refresh, and nothing runs it automatically. This is the usual
   one. Fix it permanently: run `installAutoRefresh` once. That installs a time
   driven trigger and the sheet keeps itself current from then on. For a single
   refresh now, run `refreshFromApi`.
2. `EXPORT_TOKEN` was rotated on Supabase but not in the Apps Script properties.
   They must match exactly.
3. The export route is not deployed, which shows up as 404.

The trigger runs as whoever installed it, on their authorisation. If that person
leaves or loses access to the sheet, it stops silently. Install it from an
account that will outlast recruitment, and re-run `diagnose` if the sheet ever
goes quiet again: it reports whether a trigger is installed.

`installAutoRefresh` refreshes every 15 minutes. Change `MINUTES` at the top of
that function and run it again to change the interval; it replaces its own
trigger rather than stacking a second one.

If `SHEET_ID` is set, the project is standalone and the IECSE menu does not
appear in the sheet at all. Run these from the Apps Script editor.

## Nobody can submit at all

Check in this order, stopping when one fails:

```bash
curl.exe -s https://ucoupqqibqbqdacmeuob.supabase.co/functions/v1/applications/health
curl.exe -sI https://apply.iecse-manipal.com
```

- Health failing means the function is down or was deleted.
- The page failing means Firebase Hosting or DNS.
- Both fine but submissions failing from the site is usually CORS: the origin
  has to be in `ALLOWED_ORIGINS`, and the browser console says so plainly.

## Rate limiting stopped working

It fails open on purpose: a broken limiter must never stop somebody applying.
It says so in the logs. Look for `RATE LIMITING IS NOT ACTIVE` in the function
logs; the usual cause is `supabase/rate-limit.sql` never having been run on
this project.

## Before recruitment opens

- [ ] `select count(*) from public.applications;` returns 0, no test rows left
- [ ] `EXPORT_TOKEN` rotated if it was ever pasted into a chat, a screenshot or
      a message
- [ ] Sheet refreshes and shows three tabs
- [ ] One real application submitted end to end and then deleted
- [ ] Someone other than the person who set this up knows where this file is
