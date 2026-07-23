-- =====================================================================
--  AZ Accounting — إدخالات بانتظار مراجعة الموظف المراجِع (worker2)
--  worker1 يضيف فاتورة/دفعة/مرتجع → تُرسل هنا → worker2 يوافق أو يرفض
--  شغّل هذا الملف مرة واحدة في: Supabase Dashboard → SQL Editor (آمن للتكرار)
-- =====================================================================

create table if not exists public.pending_entries (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('bill','payment','return')),
  customer_id   bigint references public.customers(id) on delete cascade,
  customer_name text,
  payload       jsonb not null,          -- فاتورة: {items,total,docNo} | دفعة/مرتجع: {amount,note,docNo,kind}
  created_by    text,                     -- اسم مستخدم مُنشئ الإدخال
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now(),
  decided_by    text,
  decided_at    timestamptz,
  reject_reason text
);

create index if not exists pending_entries_status_idx  on public.pending_entries(status);
create index if not exists pending_entries_creator_idx on public.pending_entries(created_by);

alter table public.pending_entries enable row level security;

-- أي مستخدم مسجّل يُنشئ ويقرأ ويحدّث (المراجعة داخلية بين الموظفين)
drop policy if exists pending_entries_insert on public.pending_entries;
create policy pending_entries_insert on public.pending_entries
  for insert to authenticated with check (true);
drop policy if exists pending_entries_select on public.pending_entries;
create policy pending_entries_select on public.pending_entries
  for select to authenticated using (true);
drop policy if exists pending_entries_update on public.pending_entries;
create policy pending_entries_update on public.pending_entries
  for update to authenticated using (true);
drop policy if exists pending_entries_delete on public.pending_entries;
create policy pending_entries_delete on public.pending_entries
  for delete to authenticated using (public.is_manager());

-- =====================================================================
--  انتهى. بعد تشغيله: إدخالات worker1 تذهب لمراجعة worker2.
-- =====================================================================
