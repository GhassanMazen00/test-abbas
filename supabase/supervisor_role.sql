-- =====================================================================
--  AZ Accounting — دور «المشرف» (supervisor)
--  يرى كل ما يراه المدير (قراءة فقط) + يوافق على طلبات الدخول + يدير
--  الجلسات (يرى المتصلين ويسجّل خروجهم). لا يستطيع التعديل/الإضافة/الحذف.
--  شغّل هذا الملف مرة واحدة في: Supabase Dashboard → SQL Editor (آمن للتكرار)
-- =====================================================================

-- 1) السماح بالدور 'supervisor' في جدول الملفات
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('employee','manager','supervisor'));

-- 2) تعيين المستخدم odai مشرفاً (غيّر الاسم إن لزم)
update public.profiles set role = 'supervisor' where username = 'odai';

-- 3) دالة مساعدة: هل المستخدم الحالي مشرف أو مدير؟ (للقراءة/الإشراف)
create or replace function public.is_overseer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('manager','supervisor')
  );
$$;

-- 4) سياسات القراءة/الإشراف: أضِف المشرف بجانب المدير
--    (سياسات التعديل/الإضافة/الحذف على العملاء/الفواتير/الدفعات تبقى للمدير فقط)

-- الملفات: كل مستخدم يقرأ ملفه، والمدير/المشرف يقرؤون الجميع
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_overseer());

-- الفواتير الملغية: قراءة للمدير/المشرف (التعديل/الحذف للمدير فقط)
drop policy if exists cancelled_invoices_select on public.cancelled_invoices;
create policy cancelled_invoices_select on public.cancelled_invoices
  for select to authenticated
  using (public.is_overseer());

-- طلبات الدخول: المشرف يرى الكل ويوافق/يرفض
drop policy if exists login_requests_select on public.login_requests;
create policy login_requests_select on public.login_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_overseer());
drop policy if exists login_requests_update on public.login_requests;
create policy login_requests_update on public.login_requests
  for update to authenticated
  using (public.is_overseer());

-- الجلسات النشطة: المشرف يرى المتصلين ويسجّل خروجهم
drop policy if exists active_sessions_select on public.active_sessions;
create policy active_sessions_select on public.active_sessions
  for select to authenticated
  using (user_id = auth.uid() or public.is_overseer());
drop policy if exists active_sessions_update on public.active_sessions;
create policy active_sessions_update on public.active_sessions
  for update to authenticated
  using (user_id = auth.uid() or public.is_overseer());

-- =====================================================================
--  انتهى. سجّل دخول odai — سيرى لوحة المدير للقراءة فقط مع إدارة الدخول
--  والجلسات، ودون الحاجة لموافقة على دخوله.
-- =====================================================================
