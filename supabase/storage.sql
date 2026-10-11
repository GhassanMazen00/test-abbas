-- =====================================================================
--  AZ Accounting — جدول المخزن + صلاحياته (شغّله مرة واحدة في SQL Editor
--  داخل مشروعك الحي: bjuaylhlqmfocpskvnjy)
--
--  المخزن منفصل تماماً عن الحسابات (عملاء/فواتير/دفعات) ولا يؤثّر على أي رقم.
--  يصل إليه: storage1 (إضافة/سحب كمية) + المدير (كامل) + المشرف (قراءة فقط).
-- =====================================================================

create table if not exists public.storage_items (
  id            bigint generated always as identity primary key,
  category      text not null,                 -- التصنيف: عضم / نايلون / جرار
  sub           text default '',               -- المقاس الفرعي: 3mm / 5mm / 8mm
  state         text default '',               -- مفتوح / مقفول
  color         text default '',               -- اللون
  size          text default '',               -- المقاس
  jarrar_shape  text default '',               -- شكل الجرار
  quantity      numeric not null default 0,    -- الكمية الحالية
  note          text default '',               -- ملاحظة
  created_at    timestamptz not null default now()
);
create index if not exists storage_items_cat_idx on public.storage_items(category, sub);

-- ---------- دوال مساعدة ----------
-- هل المستخدم الحالي هو موظف المخزن؟
create or replace function public.is_storage()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and username = 'storage1');
$$;

-- تحديث: موظف المخزن أيضاً «اطّلاع فقط» على البيانات المالية (ممنوع يكتب
-- في العملاء/الفواتير/الدفعات عبر الـ API) — نضيفه لقائمة المحصورين.
create or replace function public.is_readonly_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid()
      and (username in ('worker3','worker4','storage1') or role = 'supervisor')
  );
$$;

-- ---------- تفعيل RLS على جدول المخزن ----------
alter table public.storage_items enable row level security;

-- القراءة: المخزن + المدير + المشرف
drop policy if exists storage_items_select on public.storage_items;
create policy storage_items_select on public.storage_items
  for select to authenticated
  using (public.is_storage() or public.is_overseer());

-- الإضافة: المخزن أو المدير (المشرف لا يضيف)
drop policy if exists storage_items_insert on public.storage_items;
create policy storage_items_insert on public.storage_items
  for insert to authenticated
  with check (public.is_storage() or public.is_manager());

-- التعديل (إضافة/سحب كمية، مواصفات): المخزن أو المدير
drop policy if exists storage_items_update on public.storage_items;
create policy storage_items_update on public.storage_items
  for update to authenticated
  using (public.is_storage() or public.is_manager());

-- الحذف: المدير فقط
drop policy if exists storage_items_delete on public.storage_items;
create policy storage_items_delete on public.storage_items
  for delete to authenticated
  using (public.is_manager());

-- =====================================================================
--  بعد التشغيل: سجّل دخول بـ storage1 وجرّب تضيف صنف عضم 3mm وتسحب كمية.
--  لا شيء من هذا يؤثّر على أي حساب أو فاتورة.
-- =====================================================================
