alter table public.unverified_appearances
  add column if not exists resolution_status text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.admin_accounts (id),
  add column if not exists resolved_team_id uuid references public.teams (id);

create index if not exists unverified_appearances_pending_idx
  on public.unverified_appearances (normalized_name, resolution_status);
