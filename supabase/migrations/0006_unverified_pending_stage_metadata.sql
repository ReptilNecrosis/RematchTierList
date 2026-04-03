alter table public.unverified_appearances
  add column if not exists pending_team_name text,
  add column if not exists pending_short_code text,
  add column if not exists pending_tier_id text
    check (pending_tier_id in ('tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'tier6', 'tier7'));
