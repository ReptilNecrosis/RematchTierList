alter table public.unverified_appearances
  add column if not exists resolution_status text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.admin_accounts (id),
  add column if not exists resolved_team_id uuid references public.teams (id);

create index if not exists unverified_appearances_pending_idx
  on public.unverified_appearances (normalized_name, resolution_status);

-- Remove teams that were auto-placed into tier 7 as unverified stubs.
-- The current import flow writes to unverified_appearances only and never creates team records.
-- team_tier_history, team_aliases, and eligibility_flags cascade-delete automatically.
-- unverified_appearances are NOT deleted — they remain in the queue for manual review.
delete from public.teams
where current_tier_id = 'tier7'
  and verified = false;
