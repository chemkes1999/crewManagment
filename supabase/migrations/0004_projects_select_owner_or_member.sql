drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects
for select to authenticated
using (created_by = auth.uid() or public.is_project_member(id));
