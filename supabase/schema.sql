-- IECSE Recruitment — Supabase schema
--
-- Run this once, in the club's own Supabase project, from the SQL Editor.
-- It is safe to run again: every statement is guarded.
--
-- Read this before running it: the application server talks to Supabase with
-- the SERVICE ROLE key, and the service role bypasses row level security by
-- design. So the policies below are not what protects the table from the
-- server. They are what protects it from everything else — anyone who ends up
-- holding the publishable (anon) key, which is a public value that ships in
-- browsers by definition. Default deny is the whole point.

create table if not exists public.applications (
  id                  bigint generated always as identity primary key,
  full_name           varchar(200)  not null,
  year                varchar(20)   not null check (year in ('1st Year', '2nd Year')),
  registration_number varchar(10)   not null unique,
  branch              varchar(100)  not null,
  domain              text          not null,
  learner_email       varchar(254)  not null unique,
  phone_number        varchar(10)   not null unique,
  why_join            text          not null,
  github_url          text,
  linkedin_url        text,
  portfolio_url       text,
  other_links         text,
  certifications      text,
  projects            text,
  tier                varchar(20)   not null check (tier in ('member', 'workcomm', 'mancomm')),
  payment_status      varchar(20)   not null default 'pending'
                                    check (payment_status in ('pending', 'verified', 'rejected')),
  payment_id          varchar(64),
  interview_status    varchar(20)   not null default 'pending'
                                    check (interview_status in ('pending', 'not_required', 'scheduled', 'done')),
  created_at          timestamptz   not null default now()
);

-- The committee reconciles by hand, so these are the columns they filter on.
create index if not exists idx_applications_reg     on public.applications (registration_number);
create index if not exists idx_applications_email   on public.applications (learner_email);
create index if not exists idx_applications_phone   on public.applications (phone_number);
create index if not exists idx_applications_created on public.applications (created_at desc);
create index if not exists idx_applications_payment on public.applications (payment_status);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.applications enable row level security;

-- Belt and braces alongside RLS. Even with policies absent, an explicit revoke
-- means a mistake in one place does not open the table on its own.
revoke all on public.applications from anon, authenticated;

-- No policies are created for anon or authenticated, which under RLS means
-- every read, insert, update and delete from those roles is refused. Nothing
-- in this product needs a browser to reach the table: the form posts to the
-- API, and the API holds the service role key server side.
--
-- If a committee dashboard is ever built, do NOT loosen this. Add a policy
-- scoped to a specific authenticated role, for example:
--
--   create policy "committee reads applications"
--     on public.applications for select
--     to authenticated
--     using (auth.jwt() ->> 'role' = 'committee');
--
-- and grant only select. An application row carries a full name, a personal
-- email, a phone number and a payment reference for a real student.

-- ---------------------------------------------------------------------------
-- Sanity checks. Run these after the statements above.
-- ---------------------------------------------------------------------------

-- Expect rowsecurity = true
--   select relname, relrowsecurity as rls_on
--   from pg_class where relname = 'applications';

-- Expect zero rows
--   select policyname from pg_policies where tablename = 'applications';

-- Expect no privileges for anon or authenticated
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'applications' and grantee in ('anon', 'authenticated');
