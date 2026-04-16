create table if not exists public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  invited_email text not null,
  project_role text not null default 'member' check (project_role in ('admin','member')),
  token uuid not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_project_invitations_project on public.project_invitations(project_id);
create index if not exists idx_project_invitations_email on public.project_invitations(invited_email);
create index if not exists idx_project_invitations_token on public.project_invitations(token);

alter table public.project_invitations enable row level security;

drop policy if exists project_invitations_select_admin on public.project_invitations;
create policy project_invitations_select_admin on public.project_invitations
for select to authenticated
using (public.is_project_admin(project_id));

drop policy if exists project_invitations_insert_admin on public.project_invitations;
create policy project_invitations_insert_admin on public.project_invitations
for insert to authenticated
with check (public.is_project_admin(project_id) and created_by = auth.uid());

drop policy if exists project_invitations_update_admin on public.project_invitations;
create policy project_invitations_update_admin on public.project_invitations
for update to authenticated
using (public.is_project_admin(project_id));

drop policy if exists project_invitations_delete_admin on public.project_invitations;
create policy project_invitations_delete_admin on public.project_invitations
for delete to authenticated
using (public.is_project_admin(project_id));

grant select, insert, update, delete on public.project_invitations to authenticated;

