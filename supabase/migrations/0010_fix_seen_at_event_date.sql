update public.unverified_appearances ua
set seen_at = t.event_date::timestamptz
from public.tournaments t
where ua.tournament_id = t.id;
