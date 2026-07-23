-- =====================================================================
--  AZ Accounting — الفواتير الملغية (للمدير فقط)
--  سجلّ منفصل تماماً: لا يؤثر على أي مبيعات أو أرصدة، ولا يظهر في ملف العميل.
--  شغّل هذا الملف مرة واحدة في: Supabase Dashboard → SQL Editor (آمن للتكرار)
-- =====================================================================

create table if not exists public.cancelled_invoices (
  id            bigint generated always as identity primary key,
  doc_no        text default '',
  customer_name text default '',
  items         jsonb default '[]'::jsonb,
  total         numeric default 0,
  reason        text default '',
  created_at    timestamptz not null default now()
);
create index if not exists cancelled_invoices_date_idx on public.cancelled_invoices(created_at);

alter table public.cancelled_invoices enable row level security;

-- الإضافة متاحة لأي مستخدم مسجّل (worker1 والمدير)؛ القراءة/التعديل/الحذف للمدير فقط
drop policy if exists cancelled_invoices_select on public.cancelled_invoices;
create policy cancelled_invoices_select on public.cancelled_invoices
  for select to authenticated using (public.is_manager());
drop policy if exists cancelled_invoices_insert on public.cancelled_invoices;
create policy cancelled_invoices_insert on public.cancelled_invoices
  for insert to authenticated with check (true);
drop policy if exists cancelled_invoices_update on public.cancelled_invoices;
create policy cancelled_invoices_update on public.cancelled_invoices
  for update to authenticated using (public.is_manager());
drop policy if exists cancelled_invoices_delete on public.cancelled_invoices;
create policy cancelled_invoices_delete on public.cancelled_invoices
  for delete to authenticated using (public.is_manager());

-- =====================================================================
--  انتهى. سيظهر تبويب «الفواتير الملغية» للمدير.
-- =====================================================================
