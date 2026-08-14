# IECSE Recruitment Page: design decisions

The application page for IECSE, the computer science club at MIT Manipal.
This file records what was decided and why, so the next person does not undo a
choice without knowing what it cost.

Companion file: [TODO.md](TODO.md) for outstanding work.

---

## 1. What this is

A five step application form. Real applicants are first and second year
students, overwhelmingly on mid range Android phones on campus wifi. Rows land
in a Supabase `applications` table that committee members reconcile by hand over
several days.

Reached from a "Register now" button on the club site.

**Every design decision below is subordinate to one thing: a nervous first year,
on a phone, completes five screens and does not give up.** Where the interface
and that goal disagree, the goal wins.

---

## 2. Stack and deployment

| | Value |
|---|---|
| Build | Vite 8, React 19, Tailwind v4 |
| Data | Supabase (`@supabase/supabase-js`) |
| Graphics | three.js + `@react-three/fiber` + `@react-three/postprocessing` |
| Deploy | **Own subdomain**, `apply.iecse-manipal.com`, served at root |
| Base path | `/` (override with `VITE_BASE` if it ever moves under a path) |

**The club domain is `iecse-manipal.com`, hyphenated.** `iecsemanipal.com` now
redirects to an unrelated German school and its subdomains do not resolve. Do
not use it anywhere.

The main site links here via `RECRUITMENT_URL` in
`iecsemanipal-v2-prod/src/links.ts`, overridable with
`REACT_APP_RECRUITMENT_URL`.

---

## 3. Theme

**Dark, locked, one theme for the whole page.** This is a deliberate departure
from the club site, which is light. Two surfaces, one brand: the marketing site
is paper, the application is an instrument.

Do not reintroduce a light section here, and do not repaint the main site dark
to match.

---

## 4. Colour

Brand values come from the club site (`NavBar.tsx`, `GradientText.tsx`).

```
--color-ink          #050505    page ground
--color-panel        #0a0910    the working sheet, solid
--color-surface      rgba(255,255,255,0.045)
--color-line         rgba(255,255,255,0.16)   dividers
--color-line-strong  rgba(255,255,255,0.34)   anything bounding a control
--color-paper        #f7f7fa    primary text, primary button fill
--color-muted        #c4c4c4    secondary text, field labels
--color-faint        #8b8a99    tertiary text, placeholders
--color-cyan         #23c8d3    state, focus, progress
--color-violet       #886ed2    the fluid wake
--color-deep         #1f44a6    the field base
--color-alert        #f2726f    errors
```

Measured contrast on `#050505`: paper 19.06, muted 11.69, faint 6.01,
cyan 9.97, alert 7.19. `line-strong` was raised from `0.20` to `0.34` because at
1.71:1 it failed WCAG 1.4.11 for anything bounding a control; `line` was raised
from `0.10` (1.22:1) for the same reason.

**Colour is reserved for state.** Cyan means focus, progress, or selection. It
is never decoration.

---

## 5. Type

Four families, three roles plus one statement.

| Role | Face | Used for |
|---|---|---|
| display | **Unbounded** 500/600/700 | h1, step headings, tier and domain names |
| body | **Archivo** 400/500/600 | all reading text, **field labels**, inputs |
| data | **JetBrains Mono** 400/500 | registration numbers, step counters, fee, UPI ids, UTR |
| statement | **Anton** | exactly one line: "Join. Contribute. Create impact." |

**Field labels are body text, not data.** They were briefly 11px uppercase
tracked monospace, which is the hardest configuration available applied to the
element that most needs to be scannable. Reverted to Archivo 13px medium on
`--color-muted`.

**Mono is for things a human reads back, compares, or types into another
system.** Not for labels, not for eyebrows that are prose.

Never use Inter or Space Grotesk here. Both are the most common
generated-site fingerprints, and the club site's own Catamaran/Montserrat pair
was rejected as too generic for this page.

The h1 wordmark is the club's real logo, recoloured to the brand gradient
(`iecse-wordmark-colour.svg`). Sized `0.92em` so its visual mass matches the
caps of "Apply to" rather than aligning to cap height, which read as a footnote.

---

## 6. Explicitly rejected

These were tried or proposed and turned down. Do not reintroduce them without a
reason that survives the list.

| Rejected | Why |
|---|---|
| Gradient fills on buttons | Purple-to-cyan CTA gradients are the single most cited generated-site tell. Primary action is solid `--color-paper`. |
| Glassmorphism / `backdrop-filter` | Same reason, plus a repaint cost over a live shader. Panels are solid slabs. |
| Neon glow, outer shadows on CTAs | Same. Depth comes from layered neutrals and hairlines. |
| Overshoot / bounce easing | Generated-UI signature. One easing: `cubic-bezier(0.22, 1, 0.36, 1)`, no overshoot. |
| Animated gradient headline text | Kept as flat cyan. Infinite-loop micro-animation is a tell. |
| Light theme matching the club site | See section 3. |
| Form-left / effect-right split | That is the Prism layout the reference came from. Replaced by one sheet with the field bleeding behind and around it. |
| Deep `lucide-react/dist/esm/icons/*.mjs` imports | Measured: identical bundle to the barrel within one byte, because rollup tree-shakes it. Traded the public API for nothing, and lucide v1 ships no `exports` map. |

---

## 7. Layout

**One sheet, one rail, one field.**

- A single bordered sheet holds header and form together, so the page has a
  spine rather than two islands floating on a backdrop.
- A 300px meta rail sits to its right on `lg` and up. Before a registration
  number exists it carries the facts (fee, step count, time, how payment is
  checked); after, it carries the applicant's card.
- The WebGL field is full bleed and fixed, behind everything.

**The hero collapses after step 1.** Steps 2 to 5 get a 64px bar: wordmark,
`Rs 250 / Step N of 5 / Saved`. Measured at 390x844 on the payment step, this
moved the transaction reference field from y=1722 to y=1316 and the submit
button from y=2331 to y=1950.

Action rows stack (`flex-col-reverse`) below `sm`. At 360px the horizontal row
overflowed the viewport by 60px and pushed the submit button off screen.

---

## 8. The backdrop

A fork of the react-bits Dither background. The dither pass is theirs; what the
field does is not.

**Two signatures, no third.**

1. **A fluid you push around.** Velocity and dye live in a ping-pong pair of
   half-float render targets, advected semi-Lagrangian each frame, decayed
   frame-rate-independently, with a gaussian momentum splat at the pointer
   scaled by pointer speed. Velocity dies fast, dye lingers. A radial shockwave
   fires on each cleared step from the button that was pressed
   (`iecse:impulse` CustomEvent).
2. **The applicant's own seal, at viewport scale.** The 11x11 mark is uploaded
   as a `DataTexture` with nearest filtering and sampled through the fluid, so
   stirring the field deforms the mark and it re-forms as the field settles.
   `sealMix` climbs with `completionRatio`, so the picture develops as the form
   fills.

**Gating.** Desktop only (`lg` and up), off under `prefers-reduced-motion`, and
never mounted by the mobile strip (`allowShader={false}`). Mobile applicants pay
nothing for it: the 256 KB gzip chunk is never requested below 1024px.

Two traps that already bit once:

- Tailwind `hidden` / `lg:hidden` only affects paint. Both `<Backdrop>`
  instances were mounting live GL contexts above `lg`. The mount decision must
  be in JS, and a viewport query alone cannot express it because it is true for
  both instances.
- `hasWebGL()` created a probe context per mount and never released it.
  Contexts accumulate against the browser limit until the check returns false on
  a machine that is fine, and the page silently falls back forever. It now
  releases via `WEBGL_lose_context` and caches.

Nothing in the render loop is React state. Pointer motion writes to refs and
uniforms.

---

## 9. The seal

`src/lib/seal.js`. FNV-1a hash of the registration number seeds mulberry32,
which fills a vertically symmetric 11x11 halftone grid. Same number, same mark,
every device, no storage, no network.

**One generator, two renderers**: `buildSeal` for the SVG in the rail and the
confirmation, `buildSealTexture` for the GPU. They must never drift.

---

## 10. Form rules

- Label above the control, error below it, placeholder never used as a label.
- Every control wired to its message with `aria-describedby` and `aria-invalid`.
- **The error slot is always present** (`min-h-[18px]`). Inserting errors in
  flow shifted every field below by 26px per row, up to 104px on step 1, which
  on a phone means tapping the wrong input.
- Focus moves to the step heading on step change, and to the confirmation
  container on submit. Without the second, focus falls to `<body>` and a screen
  reader hears nothing at the one moment that matters.
- Focus rings live on the visible label (`has-[:focus-visible]`), because the
  real inputs are `sr-only` and a ring on a 1x1 clipped box is invisible.
- Draft persists to `localStorage` (`iecse_recruitment_draft`), debounced 600ms.
- Step lives in the URL hash. First sync uses `replaceState` so Back leaves the
  page in one press; incoming hashes are clamped to `firstInvalidStep` so a
  forwarded `#step-5` cannot land on Payment with an empty form.

---

## 11. Domain rules

These are data, not design. Changing them is a data change.

- **Years:** 1st and 2nd only.
- **Domains:** Coding, Web Development, Machine Learning, Design.
  Comp Team is not a domain.
- **Tiers:** `member`, `workcomm`, `mancomm`.
- **Who pays when:** only `member` pays while applying. WorkComm and ManComm are
  interview tiers and pay on selection. This is expressed once, as
  `paysOnApplication(tier)` in `lib/constants.js`; validation, the payload, the
  step labels and the confirmation screen all read it.
- **Step 5** is "Payment / Membership" for members and "Submit / Review and
  submit" for interview tiers.
- **Fee:** Rs 250 for the year.
- **Payload:** camelCase state maps to snake_case columns in
  `toApplicationPayload`. Optional URLs get an `https://` scheme so they are
  clickable in the committee's spreadsheet. `interview_status` is derived, not
  user supplied. Interview tiers submit `payment_status: "pending"` with a null
  `payment_id`, because they genuinely will owe the same fee later.
- Postgres `23505` on insert means a duplicate registration number or email.

---

## 12. Accessibility floor

Non-negotiable, because this is a public form students must complete on a phone.

- Real `<label>` association on every control.
- Visible focus ring everywhere, never removed.
- 4.5:1 minimum for text, 3:1 for anything bounding a control.
- 44x44px minimum touch targets.
- Errors announced, tied to their field, never colour-only.
- Completable with a keyboard alone.
- Every animation above a trivial threshold gated on `prefers-reduced-motion`.

---

## 13. Performance decisions

- Initial payload 85 KB gzip. The three.js chunk is lazy and desktop-gated.
- One WebGL context, ever.
- Icons import from the `lucide-react` barrel; rollup tree-shakes it.
- QR images are `loading="lazy"` and only mount on the payment step.
- Nothing in the animation loop calls `setState`.
