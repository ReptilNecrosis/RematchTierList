create table if not exists public.staged_team_moves (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  live_tier_id text not null check (live_tier_id in ('tier1','tier2','tier3','tier4','tier5','tier6','tier7')),
  staged_tier_id text not null check (staged_tier_id in ('tier1','tier2','tier3','tier4','tier5','tier6','tier7')),
  movement_type text not null check (movement_type in ('promotion', 'demotion')),
  staged_by_admin_id uuid references public.admin_accounts (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id)
);
