create table if not exists public.staged_inactive_removals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  staged_by_admin_id uuid references public.admin_accounts (id),
  created_at timestamptz not null default now(),
  unique(team_id)
);
