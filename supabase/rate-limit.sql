-- Rate limiting state for the applications Edge Function.
--
-- Run this once in the club's Supabase project, after supabase-schema.sql.
-- Safe to run again.
--
-- An edge function is stateless and runs in as many instances as Supabase
-- likes, so a counter held in memory limits one instance and nothing else.
-- This table is the only place every instance can agree.
--
-- What is stored is a truncated SHA-256 of the bucket name and the caller's
-- address, never the address itself. Rate limiting does not need to know who
-- anyone is, and a table of IP addresses sitting beside a table of student
-- names is a worse thing to hold than either on its own.

create table if not exists public.rate_limits (
  key          text        primary key,
  count        integer     not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- No policies, so anon and authenticated can do nothing here. The function
-- reaches it with the service role key, which bypasses row level security.

/**
 * Increments the counter for a key and returns the new value.
 *
 * Resets when the window has passed. Written as one statement so two requests
 * arriving together cannot both read the old count and both write count + 1.
 */
create or replace function public.bump_rate_limit(
  p_key text,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as r (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when r.window_start < now() - make_interval(secs => p_window_seconds)
            then 1
          else r.count + 1
        end,
        window_start = case
          when r.window_start < now() - make_interval(secs => p_window_seconds)
            then now()
          else r.window_start
        end
  returning r.count into v_count;

  return v_count;
end;
$$;

revoke all on function public.bump_rate_limit(text, integer) from anon, authenticated;

-- Housekeeping. Rows are tiny, but nothing prunes them otherwise. Run
-- occasionally, or wire it to pg_cron if that is enabled on the project.
--   delete from public.rate_limits where window_start < now() - interval '1 day';
