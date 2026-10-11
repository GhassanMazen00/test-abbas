-- =====================================================================
--  AZ Accounting — سجلّ أحداث المخزن (تدقيق كامل بتوقيت القاهرة)
--  شغّله مرة واحدة في SQL Editor (بعد storage.sql و storage_temp.sql).
--  يسجّل كل: إضافة صنف / إضافة كمية / سحب / سحب مؤقت / إرجاع — مع التوقيت والمستخدم.
-- =====================================================================
create table if not exists public.storage_events (
  id          bigint generated always as identity primary key,
  item_id     bigint references public.storage_items(id) on delete set null,
  category    text default '',
  sub         text default '',
  type        text default '',   -- item_added / qty_added / qty_withdrawn / temp_withdrawn / returned
  amount      numeric default 0,
  reason      text default '',
  actor       text default '',   -- اسم المستخدم الذي نفّذ الإجراء
  created_at  timestamptz not null default now()
);
create index if not exists storage_events_date_idx on public.storage_events(created_at);
create index if not exists storage_events_item_idx on public.storage_events(item_id);

alter table public.storage_events enable row level security;

-- القراءة: المخزن + المدير + المشرف
drop policy if exists storage_events_select on public.storage_events;
create policy storage_events_select on public.storage_events
  for select to authenticated using (public.is_storage() or public.is_overseer());

-- الكتابة (تسجيل الأحداث): المخزن أو المدير
drop policy if exists storage_events_insert on public.storage_events;
create policy storage_events_insert on public.storage_events
  for insert to authenticated with check (public.is_storage() or public.is_manager());

-- الحذف: المدير فقط (السجلّ لا يُعدَّل)
drop policy if exists storage_events_delete on public.storage_events;
create policy storage_events_delete on public.storage_events
  for delete to authenticated using (public.is_manager());
