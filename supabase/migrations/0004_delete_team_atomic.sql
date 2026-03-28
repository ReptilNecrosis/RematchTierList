create or replace function public.delete_team_atomic(target_team_id uuid, actor_admin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_team public.teams%rowtype;
begin
  if target_team_id is null then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if actor_admin_id is null then
    raise exception 'ADMIN_NOT_FOUND';
  end if;

  perform 1
  from public.admin_accounts
  where id = actor_admin_id;

  if not found then
    raise exception 'ADMIN_NOT_FOUND';
  end if;

  select *
  into locked_team
  from public.teams
  where id = target_team_id
  for update;

  if not found then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  delete from public.unverified_appearances
  where resolved_team_id = locked_team.id;

  delete from public.series_results
  where team_one_id = locked_team.id
     or team_two_id = locked_team.id;

  delete from public.challenge_series
  where challenger_team_id = locked_team.id
     or defender_team_id = locked_team.id;

  delete from public.teams
  where id = locked_team.id;

  insert into public.activity_log (
    admin_account_id,
    verb,
    subject
  )
  values (
    actor_admin_id,
    'deleted',
    'team ' || locked_team.name
  );

  return jsonb_build_object(
    'teamId', locked_team.id,
    'teamName', locked_team.name
  );
end;
$$;
