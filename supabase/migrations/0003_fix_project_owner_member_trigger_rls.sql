create or replace function public.add_project_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.project_members (project_id, user_id, project_role)
  values (new.id, new.created_by, 'admin')
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.add_project_owner_member() from public;
