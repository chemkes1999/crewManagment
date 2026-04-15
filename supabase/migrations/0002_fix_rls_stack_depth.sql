create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_admin(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.project_role = 'admin'
  );
$$;

revoke all on function public.is_project_member(uuid) from public;
revoke all on function public.is_project_admin(uuid) from public;

grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_admin(uuid) to authenticated;
