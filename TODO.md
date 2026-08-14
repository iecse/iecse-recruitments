# Outstanding work

Companion to [DESIGN.md](DESIGN.md). Ordered by what blocks shipping.

Status as of the last working session. Nothing in this repo has ever talked to a
live Supabase, and no build has been deployed anywhere.

---

## Blockers: needed before a link goes to students

### 1. Supabase row level security
**The biggest risk on the list.** The `applications` table holds names, emails,
phone numbers and payment references for a few hundred students. Verify in the
dashboard that `anon` can insert and cannot select.

```sql
alter table applications enable row level security;
create policy "anon can apply" on applications
  for insert to anon with check (true);
```

No `select` policy for `anon`. If one exists today, the whole table is public.

### 2. Delete `checkDuplicate`
`RecruitmentPage.jsx`. It only works if the table is anon-readable, which is
exactly what step 1 forbids. It is also a registration-number enumeration
oracle. The unique constraint already rejects duplicates at submit and the
`23505` message is already written.

Alternative if the early warning is wanted: move it behind an RPC that returns
only a boolean. Not worth doing before launch.

### 3. DNS
Create `apply.iecse-manipal.com` pointing at the host. Note that even
`www.iecse-manipal.com` does not resolve, so assume nothing in the zone exists.

### 4. Environment variables
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` on the recruitment
build. Without them the page renders but submission is disabled and says so.

Set `REACT_APP_RECRUITMENT_URL` on the main site build only if the subdomain
differs from the default.

### 5. Regenerate the QR codes
`src/assets/qr1.jpg`, `qr2.jpg` are 737x1024 phone screenshots of a GPay receive
screen. They show a committee member's real name and Google avatar, and they are
JPEG, which is the wrong format for line art. Regenerate from the VPA as SVG
with the amount encoded, and strip the personal details.

### 6. Test on a real Android phone
The `upi://` intent links are now the primary payment path for members and
cannot be verified from a desktop harness. Confirm the app chooser opens, the
amount is prefilled at 250, and the registration number rides along in the note.

### 7. One real end-to-end submission
Apply as a fake student against live Supabase. Confirm the row lands with every
field correct, for both a `member` and an interview tier.

---

## Known defects, not yet fixed

| Where | Problem |
|---|---|
| Domain and tier steps | Errors are announced but not programmatically tied to the controls, and `focusFirstError` cannot reach them because the group never gets `aria-invalid`. |
| Empty submit | Six `role="alert"` nodes fire at once; screen readers queue and interrupt. Should be one summary region linking to each field. |
| `Clear draft` | Under the 24x24 WCAG 2.5.8 target minimum for a destructive action. |
| Phone field | `maxLength={10}` silently truncates a pasted `+919845123456` to `+9198451234`, then reports a confusing error. Strip non-digits on input instead. |
| Stale drafts | A draft saved before the domain list changed can still carry `Comp Team (Autonomous)` into a submission. Restored values are not re-validated against the current list. |
| Success screen | No confirmation email and no server-returned application id. The reference shown is the applicant's own input. |
| Submit failure | No request timeout. A stalled connection, the exact campus-wifi failure mode, leaves the button locked in `submitting` forever. |
| `#root` | Ships empty with no inline fallback, so the first paint on a slow connection is a black rectangle with no wordmark and no text. |
| Fonts | Four families in one render-blocking Google Fonts request, 44 `@font-face` declarations to use 6, two extra origins on the critical path. |
| `og:image` | Missing, on a page whose main distribution channel is a WhatsApp group. |

---

## Design work not done

- **The shader does not read as fluid.** It renders as a hard-edged blue
  checkerboard occupying roughly the middle third, with the rest quantised flat
  to black by `clamp(color - 0.2, ...)` in the dither pass. The concept and the
  wiring are both verified working; the render is what fails them. Try raising
  the ambient floor and pulling the black clamp back. If it cannot be made to
  read as fluid, ship `STATIC_FIELD` on desktop too and keep the shader for the
  next iteration.
- **Four type families is not yet justified.** Anton exists for one line and
  costs a family in the critical path. Either cut it, or earn it by using it for
  step titles as well.
- **Unbounded is doing UI-label work** at 14px/600 where its wide counters close
  up. Consider capping it at 20px and handing everything below to Archivo 600.
- **The rail is still empty on mobile.** The applicant card only appears at `lg`.
- Real instructions still live in placeholders on a few fields
  ("As it appears on your college record"). They vanish on focus. Move them to
  the `hint` slot, which already exists and is already wired to
  `aria-describedby`.

---

## Cleanup

There is **no git history in this repo**, so archive before deleting anything.

- `src/IECSERecruitment.jsx` (1,860 lines, unreferenced, accounts for 6 of the
  remaining lint errors)
- `src/App.css` (184 lines, never imported)
- `public/qr1.jpg`, `public/qr2.jpg` (duplicates of the ones in `src/assets`;
  both copies currently ship, 158 KB of dead weight)
- `src/assets/hero.png`, `react.svg`, `vite.svg`
- `QrCode` export in `src/components/ui/icons.js`, unused
- `paymentStatus` and `interviewStatus` in `DEFAULT_FORM` are dead state; both
  are derived in `toApplicationPayload`

`npx eslint src` currently reports errors. The remaining live-code ones are
React Compiler rules about mutating memoised render targets inside `useFrame`,
which is standard r3f practice but would break under the compiler.

---

## Main site (`iecsemanipal-v2-prod`)

Separate job, but two of these are urgent.

- **The contact form is broken.** `ContactUs.tsx:362` POSTs to
  `https://mail.iecsemanipal.com/contact-us`, a host that no longer resolves.
- **`hello@iecsemanipal.com` is published as the contact address** in two
  places. That domain now belongs to someone else, so mail sent there goes to
  them.
- 13 references to the dead domain remain, including `members.`, `code.` and
  `design.` subdomains in `NavBar.tsx` and `data.js`. Only `og:url` was fixed.
- The repo has no `node_modules`, so the `RECRUITMENT_URL` and `NavBar` /
  `MobileNav` edits adding the "Register now" button have never been compiled.
