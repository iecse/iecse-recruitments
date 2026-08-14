# IECSE Recruitment

The application page for IECSE, the computer science club at MIT Manipal.

Five steps, saved as you go. Applications land in a Supabase `applications`
table that the committee reconciles by hand.

## Running it

```bash
npm install
npm run dev
```

Create a `.env` with:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Without them the page still renders and the form still works, but submission is
disabled and says so inline.

## Building

```bash
npm run build
```

Deploys to its own subdomain and is served from the root. If it ever moves under
a path, set `VITE_BASE` (for example `VITE_BASE=/apply/`).

## Before changing anything

- [DESIGN.md](DESIGN.md) records what was decided and why, including a list of
  things that were deliberately rejected. Read it before reintroducing one.
- [TODO.md](TODO.md) lists what is still outstanding, ordered by what blocks
  shipping. The first item is a Supabase row level security check, and it
  matters more than anything else in this repo.

## Stack

Vite, React 19, Tailwind v4, Supabase, and a three.js backdrop that is lazy
loaded and desktop only.

`npx eslint src` should exit clean.
