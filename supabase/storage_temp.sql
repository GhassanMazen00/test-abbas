-- =====================================================================
--  AZ Accounting — السحب المؤقت (إعارة) لأصناف المخزن
--  شغّله مرة واحدة في SQL Editor داخل مشروعك الحي (بعد storage.sql).
--
--  كل سحب مؤقت = سجلّ فيه الكمية المسحوبة + السبب + كم أُرجع منها.
--  السحب يُنقص كمية الصنف، والإرجاع (جزء أو كل) يعيدها.
-- =====================================================================

create table if not exists public.storage_withdrawals (
  id          bigint generated always as identity primary key,
  item_id     bigint not null references public.storage_items(id) on delete cascade,
  amount      numeric not null default 0,   -- الكمية المسحوبة مؤقتاً
  returned    numeric not null default 0,   -- الكمية المُرجعة حتى الآن
  reason      text default '',              -- سبب السحب المؤقت
  created_at  timestamptz not null default now()
);
create index if not exists storage_withdrawals_item_idx on public.storage_withdrawals(item_id);

alter table public.storage_withdrawals enable row level security;

-- نفس صلاحيات المخزن: قراءة (مخزن/مدير/مشرف)، كتابة (مخزن/مدير)، حذف (مدير)
drop policy if exists storage_withdrawals_select on public.storage_withdrawals;
create policy storage_withdrawals_select on public.storage_withdrawals
  for select to authenticated using (public.is_storage() or public.is_overseer());

drop policy if exists storage_withdrawals_insert on public.storage_withdrawals;
create policy storage_withdrawals_insert on public.storage_withdrawals
  for insert to authenticated with check (public.is_storage() or public.is_manager());

drop policy if exists storage_withdrawals_update on public.storage_withdrawals;
create policy storage_withdrawals_update on public.storage_withdrawals
  for update to authenticated using (public.is_storage() or public.is_manager());

drop policy if exists storage_withdrawals_delete on public.storage_withdrawals;
create policy storage_withdrawals_delete on public.storage_withdrawals
  for delete to authenticated using (public.is_manager());
