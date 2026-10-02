-- Enforce same-tenant relationships for attendance and limit RPC execution to signed-in users.
alter table public.members
  add constraint members_tenant_id_id_unique unique (tenant_id, id);

alter table public.services
  add constraint services_tenant_id_id_unique unique (tenant_id, id);

alter table public.attendance_records
  add constraint attendance_service_same_tenant_fk
  foreign key (tenant_id, service_id)
  references public.services(tenant_id, id)
  on delete restrict;

alter table public.attendance_records
  add constraint attendance_member_same_tenant_fk
  foreign key (tenant_id, member_id)
  references public.members(tenant_id, id)
  on delete restrict;

revoke all on function public.is_tenant_member(uuid) from public, anon;
revoke all on function public.has_tenant_role(uuid, text[]) from public, anon;
revoke all on function public.create_tenant_for_current_user(text, text) from public, anon;

grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid, text[]) to authenticated;
grant execute on function public.create_tenant_for_current_user(text, text) to authenticated;
