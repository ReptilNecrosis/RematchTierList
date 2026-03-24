create extension if not exists pgcrypto;

create table if not exists public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  username text not null unique,
  display_name text not null,
  role text not null check (role in ('super_admin', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  short_code text not null,
  current_tier_id text not null check (current_tier_id in ('tier1','tier2','tier3','tier4','tier5','tier6','tier7')),
  verified boolean not null default false,
  notes text,
  created_by uuid references public.admin_accounts (id),
  created_at timestamptz not null default now()
);

create table if not exists public.team_aliases (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  unique(team_id, alias)
);

create table if not exists public.team_tier_history (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  from_tier_id text,
  to_tier_id text not null,
  movement_type text not null,
  reason text not null,
  created_by uuid references public.admin_accounts (id),
  created_at timestamptz not null default now()
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  created_by uuid references public.admin_accounts (id),
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_sources (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  source_type text not null check (source_type in ('battlefy', 'startgg', 'screenshot')),
  url text,
  source_ref text,
  status text not null default 'pending'
);

create table if not exists public.series_results (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  played_at timestamptz not null,
  team_one_name text not null,
  team_two_name text not null,
  team_one_id uuid references public.teams (id),
  team_two_id uuid references public.teams (id),
  team_one_tier_id text not null,
  team_two_tier_id text not null,
  team_one_score integer not null,
  team_two_score integer not null,
  source_type text not null check (source_type in ('battlefy', 'startgg', 'screenshot')),
  source_ref text not null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.eligibility_flags (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  movement_type text not null check (movement_type in ('promotion', 'demotion')),
  reason text not null,
  priority_score numeric(6, 3) not null default 0,
  requires_manual_approval boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_series (
  id uuid primary key default gen_random_uuid(),
  state text not null check (state in ('pending', 'active', 'expired', 'resolved')),
  challenger_team_id uuid not null references public.teams (id),
  defender_team_id uuid not null references public.teams (id),
  challenger_tier_id text not null,
  defender_tier_id text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.unverified_appearances (
  id uuid primary key default gen_random_uuid(),
  team_name text not null,
  normalized_name text not null,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  seen_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  admin_account_id uuid references public.admin_accounts (id),
  verb text not null,
  subject text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.discord_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('resync_summary', 'movement_post', 'test_post')),
  payload jsonb not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  start_gg_api_key_ciphertext text,
  discord_bot_token_ciphertext text,
  discord_channel_id text,
  discord_pinned_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
