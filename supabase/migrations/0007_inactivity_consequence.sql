alter table public.teams
  add column if not exists inactivity_consequence text not null default 'none'
  check (inactivity_consequence in ('none', 'removal_pending', 'demotion_pending'));
