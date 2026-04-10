ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.unverified_appearances
ADD COLUMN IF NOT EXISTS logo_url text;
