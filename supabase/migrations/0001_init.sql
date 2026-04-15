create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key,
  full_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  project_role text not null default 'member' check (project_role in ('admin','member')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  created_by uuid not null,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('backlog','todo','in_progress','done')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  task_id uuid,
  user_id uuid not null,
  entry_date date not null,
  minutes int not null check (minutes > 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  task_id uuid,
  filename text not null,
  storage_path text not null,
  uploaded_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  task_id uuid,
  to_email text not null,
  subject text not null,
  body_preview text not null,
  sent_by uuid not null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_project_members_project on public.project_members(project_id);
create index if not exists idx_project_members_user on public.project_members(user_id);
create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_task_assignees_task on public.task_assignees(task_id);
create index if not exists idx_task_assignees_user on public.task_assignees(user_id);
create index if not exists idx_time_entries_project on public.time_entries(project_id);
create index if not exists idx_time_entries_user_date on public.time_entries(user_id, entry_date desc);
create index if not exists idx_documents_project on public.documents(project_id);
create index if not exists idx_email_logs_project on public.email_logs(project_id);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.time_entries enable row level security;
alter table public.documents enable row level security;
alter table public.email_logs enable row level security;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
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
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.project_role = 'admin'
  );
$$;

create or replace function public.add_project_owner_member()
returns trigger
language plpgsql
as $$
begin
  insert into public.project_members (project_id, user_id, project_role)
  values (new.id, new.created_by, 'admin')
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_add_project_owner_member on public.projects;
create trigger trg_add_project_owner_member
after insert on public.projects
for each row
execute procedure public.add_project_owner_member();

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects
for select to authenticated
using (public.is_project_member(id));

drop policy if exists projects_insert_owner on public.projects;
create policy projects_insert_owner on public.projects
for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists projects_update_admin on public.projects;
create policy projects_update_admin on public.projects
for update to authenticated
using (public.is_project_admin(id) or created_by = auth.uid());

drop policy if exists projects_delete_admin on public.projects;
create policy projects_delete_admin on public.projects
for delete to authenticated
using (public.is_project_admin(id) or created_by = auth.uid());

drop policy if exists project_members_select_member on public.project_members;
create policy project_members_select_member on public.project_members
for select to authenticated
using (public.is_project_member(project_id));

drop policy if exists project_members_insert_admin on public.project_members;
create policy project_members_insert_admin on public.project_members
for insert to authenticated
with check (
  (exists (select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()))
  or public.is_project_admin(project_id)
);

drop policy if exists project_members_update_admin on public.project_members;
create policy project_members_update_admin on public.project_members
for update to authenticated
using (public.is_project_admin(project_id));

drop policy if exists project_members_delete_admin on public.project_members;
create policy project_members_delete_admin on public.project_members
for delete to authenticated
using (public.is_project_admin(project_id));

drop policy if exists tasks_select_member on public.tasks;
create policy tasks_select_member on public.tasks
for select to authenticated
using (public.is_project_member(project_id));

drop policy if exists tasks_insert_member on public.tasks;
create policy tasks_insert_member on public.tasks
for insert to authenticated
with check (public.is_project_member(project_id) and created_by = auth.uid());

drop policy if exists tasks_update_member on public.tasks;
create policy tasks_update_member on public.tasks
for update to authenticated
using (public.is_project_member(project_id));

drop policy if exists tasks_delete_admin_or_owner on public.tasks;
create policy tasks_delete_admin_or_owner on public.tasks
for delete to authenticated
using (public.is_project_admin(project_id) or created_by = auth.uid());

drop policy if exists task_assignees_select_member on public.task_assignees;
create policy task_assignees_select_member on public.task_assignees
for select to authenticated
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.is_project_member(t.project_id)
  )
);

drop policy if exists task_assignees_insert_member on public.task_assignees;
create policy task_assignees_insert_member on public.task_assignees
for insert to authenticated
with check (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.is_project_member(t.project_id)
  )
);

drop policy if exists task_assignees_delete_member on public.task_assignees;
create policy task_assignees_delete_member on public.task_assignees
for delete to authenticated
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.is_project_member(t.project_id)
  )
);

drop policy if exists time_entries_select_self_or_admin on public.time_entries;
create policy time_entries_select_self_or_admin on public.time_entries
for select to authenticated
using (public.is_project_admin(project_id) or user_id = auth.uid());

drop policy if exists time_entries_insert_self on public.time_entries;
create policy time_entries_insert_self on public.time_entries
for insert to authenticated
with check (public.is_project_member(project_id) and user_id = auth.uid());

drop policy if exists time_entries_update_self on public.time_entries;
create policy time_entries_update_self on public.time_entries
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists time_entries_delete_self on public.time_entries;
create policy time_entries_delete_self on public.time_entries
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists documents_select_member on public.documents;
create policy documents_select_member on public.documents
for select to authenticated
using (public.is_project_member(project_id));

drop policy if exists documents_insert_member on public.documents;
create policy documents_insert_member on public.documents
for insert to authenticated
with check (public.is_project_member(project_id) and uploaded_by = auth.uid());

drop policy if exists documents_delete_admin_or_owner on public.documents;
create policy documents_delete_admin_or_owner on public.documents
for delete to authenticated
using (public.is_project_admin(project_id) or uploaded_by = auth.uid());

drop policy if exists email_logs_select_member on public.email_logs;
create policy email_logs_select_member on public.email_logs
for select to authenticated
using (public.is_project_member(project_id));

drop policy if exists email_logs_insert_member on public.email_logs;
create policy email_logs_insert_member on public.email_logs
for insert to authenticated
with check (public.is_project_member(project_id) and sent_by = auth.uid());

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant insert, update on public.profiles to authenticated;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.task_assignees to authenticated;
grant select, insert, update, delete on public.time_entries to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.email_logs to authenticated;

