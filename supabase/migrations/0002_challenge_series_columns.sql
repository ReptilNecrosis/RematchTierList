alter table public.challenge_series
  add column if not exists blocked_movement text not null default 'promotion' check (blocked_movement in ('promotion', 'demotion')),
  add column if not exists challenger_wins integer not null default 0,
  add column if not exists defender_wins integer not null default 0,
  add column if not exists resolved_at timestamptz,
  add column if not exists outcome text check (outcome in ('challenger_wins', 'defender_wins', 'expired')),
  add column if not exists approved_by_admin_id uuid references public.admin_accounts(id);
