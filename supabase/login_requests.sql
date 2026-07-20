-- =====================================================================
--  AZ Accounting — طلبات الدخول (موافقة المدير على دخول الموظفين)
--  شغّل هذا الملف مرة واحدة في: Supabase Dashboard → SQL Editor
--  (آمن للتكرار)
-- =====================================================================

create table if not exists public.login_requests (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  username   text,
  device     text,                         -- نوع الجهاز/النظام/المتصفح
  status     text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists login_requests_status_idx  on public.login_requests(status);
create index if not exists login_requests_user_idx    on public.login_requests(user_id);

alter table public.login_requests enable row level security;

-- كل مستخدم يُنشئ طلباً باسمه ويقرأ طلبه؛ المدير يقرأ الجميع ويوافق/يرفض
drop policy if exists login_requests_insert on public.login_requests;
create policy login_requests_insert on public.login_requests
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists login_requests_select on public.login_requests;
create policy login_requests_select on public.login_requests
  for select to authenticated using (user_id = auth.uid() or public.is_manager());

drop policy if exists login_requests_update on public.login_requests;
create policy login_requests_update on public.login_requests
  for update to authenticated using (public.is_manager());

-- =====================================================================
--  انتهى. بعد تشغيله سيظهر تبويب «طلبات الدخول» للمدير loai تلقائياً.
-- =====================================================================
