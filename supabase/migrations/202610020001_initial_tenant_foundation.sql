-- MKS Register: tenant-aware identity, member, service, attendance, and audit foundation.
-- Apply to a development project first; back up production before applying migrations.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 70),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('OWNER', 'ADMIN', 'MANAGER', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'REPORT_VIEWER', 'VOLUNTEER', 'MEMBER')),
  status text not null default 'ACTIVE' check (status in ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index if not exists tenant_memberships_user_status_idx on public.tenant_memberships(user_id, status);
create index if not exists tenant_memberships_tenant_role_idx on public.tenant_memberships(tenant_id, role, status);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  member_number text,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  email text,
  phone text,
  membership_status text not null default 'ACTIVE' check (membership_status in ('ACTIVE', 'INACTIVE', 'VISITOR', 'PENDING', 'DEPARTED')),
  registration_date date not null default current_date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, member_number)
);
create index if not exists members_tenant_created_idx on public.members(tenant_id, created_at desc) where deleted_at is null;
create index if not exists members_tenant_name_idx on public.members(tenant_id, lower(full_name)) where deleted_at is null;
create unique index if not exists members_tenant_email_active_uidx on public.members(tenant_id, lower(email)) where email is not null and deleted_at is null;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  service_type text not null default 'SUNDAY' check (service_type in ('SUNDAY', 'MIDWEEK', 'YOUTH', 'PRAYER', 'SPECIAL', 'CONFERENCE', 'OTHER')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  capacity integer check (capacity is null or capacity >= 0),
  status text not null default 'PUBLISHED' check (status in ('DRAFT', 'PUBLISHED', 'CANCELLED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists services_tenant_starts_idx on public.services(tenant_id, starts_at desc) where deleted_at is null;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  status text not null default 'PRESENT' check (status in ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'VISITOR', 'FIRST_TIME_VISITOR')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  recording_method text not null default 'MANUAL' check (recording_method in ('MANUAL', 'QR', 'IMPORT', 'ADMIN', 'KIOSK')),
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, service_id, member_id),
  check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at)
);
create index if not exists attendance_tenant_service_idx on public.attendance_records(tenant_id, service_id);
create index if not exists attendance_tenant_member_idx on public.attendance_records(tenant_id, member_id, created_at desc);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_tenant_created_idx on public.audit_logs(tenant_id, created_at desc);
create index if not exists audit_logs_actor_created_idx on public.audit_logs(actor_id, created_at desc);

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.tenant_memberships tm where tm.tenant_id = p_tenant_id and tm.user_id = auth.uid() and tm.status = 'ACTIVE');
$$;

create or replace function public.has_tenant_role(p_tenant_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.tenant_memberships tm where tm.tenant_id = p_tenant_id and tm.user_id = auth.uid() and tm.status = 'ACTIVE' and tm.role = any(p_roles));
$$;

create or replace function public.create_tenant_for_current_user(p_name text, p_slug text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_tenant public.tenants;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'Invalid workspace name' using errcode = '22023'; end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 70 then raise exception 'Invalid workspace slug' using errcode = '22023'; end if;
  insert into public.tenants(name, slug) values (trim(p_name), p_slug) returning * into v_tenant;
  insert into public.tenant_memberships(tenant_id, user_id, role, status) values (v_tenant.id, auth.uid(), 'OWNER', 'ACTIVE');
  return jsonb_build_object('id', v_tenant.id, 'name', v_tenant.name, 'slug', v_tenant.slug, 'status', v_tenant.status, 'role', 'OWNER', 'created_at', v_tenant.created_at);
end;
$$;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_tenant_id uuid; v_resource_id text; v_before jsonb; v_after jsonb;
begin
  if tg_op = 'INSERT' then v_tenant_id := new.tenant_id; v_resource_id := new.id::text; v_after := to_jsonb(new);
  elsif tg_op = 'UPDATE' then v_tenant_id := new.tenant_id; v_resource_id := new.id::text; v_before := to_jsonb(old); v_after := to_jsonb(new);
  else v_tenant_id := old.tenant_id; v_resource_id := old.id::text; v_before := to_jsonb(old); end if;
  insert into public.audit_logs(tenant_id, actor_id, action, resource_type, resource_id, before_data, after_data)
  values (v_tenant_id, auth.uid(), tg_op, tg_table_name, v_resource_id, v_before, v_after);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists members_audit_change on public.members;
create trigger members_audit_change after insert or update or delete on public.members for each row execute function public.audit_row_change();
drop trigger if exists services_audit_change on public.services;
create trigger services_audit_change after insert or update or delete on public.services for each row execute function public.audit_row_change();
drop trigger if exists attendance_audit_change on public.attendance_records;
create trigger attendance_audit_change after insert or update or delete on public.attendance_records for each row execute function public.audit_row_change();
drop trigger if exists memberships_audit_change on public.tenant_memberships;
create trigger memberships_audit_change after insert or update or delete on public.tenant_memberships for each row execute function public.audit_row_change();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.members enable row level security;
alter table public.services enable row level security;
alter table public.attendance_records enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists tenants_read_members on public.tenants;
create policy tenants_read_members on public.tenants for select to authenticated using (public.is_tenant_member(id));

drop policy if exists memberships_read_self_or_admin on public.tenant_memberships;
create policy memberships_read_self_or_admin on public.tenant_memberships for select to authenticated using (user_id = auth.uid() or public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN']));
drop policy if exists memberships_admin_manage on public.tenant_memberships;
create policy memberships_admin_manage on public.tenant_memberships for all to authenticated using (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN'])) with check (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN']));

drop policy if exists members_read_tenant on public.members;
create policy members_read_tenant on public.members for select to authenticated using (public.is_tenant_member(tenant_id));
drop policy if exists members_insert_tenant on public.members;
create policy members_insert_tenant on public.members for insert to authenticated with check (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN', 'MANAGER', 'REGISTRAR']));
drop policy if exists members_update_tenant on public.members;
create policy members_update_tenant on public.members for update to authenticated using (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN', 'MANAGER', 'REGISTRAR'])) with check (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN', 'MANAGER', 'REGISTRAR']));
drop policy if exists members_soft_delete_tenant on public.members;
create policy members_soft_delete_tenant on public.members for delete to authenticated using (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN']));

drop policy if exists services_read_tenant on public.services;
create policy services_read_tenant on public.services for select to authenticated using (public.is_tenant_member(tenant_id));
drop policy if exists services_write_tenant on public.services;
create policy services_write_tenant on public.services for all to authenticated using (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN', 'MANAGER', 'REGISTRAR'])) with check (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN', 'MANAGER', 'REGISTRAR']));

drop policy if exists attendance_read_tenant on public.attendance_records;
create policy attendance_read_tenant on public.attendance_records for select to authenticated using (public.is_tenant_member(tenant_id));
drop policy if exists attendance_insert_tenant on public.attendance_records;
create policy attendance_insert_tenant on public.attendance_records for insert to authenticated with check (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN', 'MANAGER', 'REGISTRAR', 'ATTENDANCE_OFFICER']));
drop policy if exists attendance_update_tenant on public.attendance_records;
create policy attendance_update_tenant on public.attendance_records for update to authenticated using (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN', 'MANAGER', 'REGISTRAR', 'ATTENDANCE_OFFICER'])) with check (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN', 'MANAGER', 'REGISTRAR', 'ATTENDANCE_OFFICER']));
drop policy if exists attendance_delete_tenant on public.attendance_records;
create policy attendance_delete_tenant on public.attendance_records for delete to authenticated using (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN']));

drop policy if exists audit_read_admins on public.audit_logs;
create policy audit_read_admins on public.audit_logs for select to authenticated using (public.has_tenant_role(tenant_id, array['OWNER', 'ADMIN', 'MANAGER']));

grant select, update on public.profiles to authenticated;
grant select on public.tenants to authenticated;
grant select on public.tenant_memberships to authenticated;
grant insert, select, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.attendance_records to authenticated;
grant select on public.audit_logs to authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid, text[]) to authenticated;
grant execute on function public.create_tenant_for_current_user(text, text) to authenticated;
