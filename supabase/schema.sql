-- =====================================================================
--  AZ Accounting — مخطط قاعدة البيانات على Supabase (Postgres)
--  شغّل هذا الملف كاملاً مرة واحدة في: Supabase Dashboard → SQL Editor
-- =====================================================================

-- ---------- 1) الجداول ----------

-- ملفات المستخدمين (الدور: موظف / مدير) مرتبطة بمستخدمي المصادقة
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  role       text not null default 'employee' check (role in ('employee','manager')),
  created_at timestamptz not null default now()
);

-- العملاء
create table if not exists public.customers (
  id         bigint generated always as identity primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

-- الفواتير (الأصناف مخزّنة كمصفوفة JSON: [{description, count, price}, ...])
create table if not exists public.bills (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  items       jsonb  not null default '[]'::jsonb,
  total       numeric not null default 0,
  doc_no      text default '',              -- رقم الكشف
  created_at  timestamptz not null default now()
);

-- الدفعات والحركات الدائنة (kind: payment=دفعة, transfer=ترحيل, discount=خصم, return=مرتجع)
create table if not exists public.payments (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  amount      numeric not null default 0,
  note        text default '',
  doc_no      text default '',              -- رقم الدفعة
  kind        text not null default 'payment' check (kind in ('payment','transfer','discount','return')),
  created_at  timestamptz not null default now()
);

-- ترقية قواعد بيانات موجودة (آمنة للتكرار)
alter table public.bills    add column if not exists doc_no text default '';
alter table public.payments add column if not exists doc_no text default '';
alter table public.payments add column if not exists kind   text not null default 'payment';

create index if not exists bills_customer_idx    on public.bills(customer_id);
create index if not exists payments_customer_idx on public.payments(customer_id);

-- ---------- 2) دالة مساعدة: هل المستخدم الحالي مدير؟ ----------
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager'
  );
$$;

-- ---------- 3) إنشاء ملف تعريف تلقائياً عند إضافة مستخدم مصادقة ----------
-- اسم المستخدم = الجزء قبل @ من البريد، والدور من user metadata (افتراضياً موظف)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text := split_part(new.email, '@', 1);
begin
  -- اسم مستخدم صالح وغير مكرّر (حتى لا يفشل الإدراج ويمنع إنشاء المستخدم)
  if uname is null or uname = '' then
    uname := 'user_' || substr(new.id::text, 1, 8);
  end if;
  if exists (select 1 from public.profiles where username = uname) then
    uname := uname || '_' || substr(new.id::text, 1, 4);
  end if;

  insert into public.profiles (id, username, role)
  values (new.id, uname, coalesce(new.raw_user_meta_data ->> 'role', 'employee'))
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- لا تُفشل إنشاء مستخدم المصادقة بسبب أي خطأ في إنشاء الملف الشخصي
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 4) تفعيل Row Level Security ----------
alter table public.profiles  enable row level security;
alter table public.customers enable row level security;
alter table public.bills     enable row level security;
alter table public.payments  enable row level security;

-- profiles: كل مستخدم يقرأ ملفه، والمدير يقرأ الجميع
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_manager());

-- customers: أي مستخدم مسجّل يقرأ ويضيف؛ التعديل/الحذف للمدير فقط
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated using (true);
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert to authenticated with check (true);
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated using (public.is_manager());
drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers
  for delete to authenticated using (public.is_manager());

-- bills: قراءة وإضافة لأي مستخدم مسجّل؛ التعديل/الحذف للمدير فقط
drop policy if exists bills_select on public.bills;
create policy bills_select on public.bills
  for select to authenticated using (true);
drop policy if exists bills_insert on public.bills;
create policy bills_insert on public.bills
  for insert to authenticated with check (true);
drop policy if exists bills_update on public.bills;
create policy bills_update on public.bills
  for update to authenticated using (public.is_manager());
drop policy if exists bills_delete on public.bills;
create policy bills_delete on public.bills
  for delete to authenticated using (public.is_manager());

-- payments: قراءة وإضافة لأي مستخدم مسجّل؛ التعديل/الحذف للمدير فقط
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated using (true);
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated with check (true);
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update to authenticated using (public.is_manager());
drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments
  for delete to authenticated using (public.is_manager());

-- ---------- 5) (اختياري) أسماء العملاء التجريبية ----------
-- احذف علامات التعليق إذا رغبت ببيانات مبدئية:
-- insert into public.customers (name) values
--   ('تاون تيم'),('ابو وسيم'),('ابو محمد فادي'),('فادي عكام'),('العتال'),
--   ('اتش جي ام'),('زاهر السباعي'),('عبد اله الحسامي'),('الدمياطي'),
--   ('باسل دقاق'),('زوسر'),('جي ات اس'),('شريفة'),('رضا شحاتة'),('سامر المصري');

-- =====================================================================
--  انتهى. الخطوة التالية: أنشئ مستخدمَي الدخول (انظر SUPABASE_SETUP.md)
-- =====================================================================
