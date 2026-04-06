alter table public.unverified_appearances
  drop column if exists pending_short_code;

alter table public.teams
  drop column if exists short_code;
