alter table public.teams
  add column if not exists deleted_at timestamptz;

create or replace function public.soft_delete_team_atomic(
  target_team_id uuid,
  actor_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_team public.teams%rowtype;
begin
  perform 1 from public.admin_accounts where id = actor_admin_id;
  if not found then raise exception 'ADMIN_NOT_FOUND'; end if;

  select *
  into locked_team
  from public.teams
  where id = target_team_id
  for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;

  if locked_team.deleted_at is not null then
    raise exception 'TEAM_ALREADY_DELETED';
  end if;

  delete from public.staged_team_moves where team_id = locked_team.id;

  update public.teams set deleted_at = now() where id = locked_team.id;

  insert into public.activity_log (admin_account_id, verb, subject)
  values (actor_admin_id, 'deleted', 'team ' || locked_team.name);

  return jsonb_build_object('teamId', locked_team.id, 'teamName', locked_team.name);
end;
$$;
