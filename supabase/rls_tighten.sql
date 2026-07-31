-- =====================================================================
--  AZ Accounting — تشديد سياسات RLS (حماية البيانات على مستوى قاعدة
--  البيانات نفسها، لا الواجهة فقط). شغّلها مرة واحدة في SQL Editor.
--
--  المبدأ: لا تُحذف أي بيانات، ولا تتغيّر صلاحيات القراءة (حتى لا يفقد
--  أحد وصوله). نُقيّد فقط الكتابة في الجداول المالية بحيث تُطابق ما
--  يفعله كل دور فعلاً في التطبيق:
--    • worker1 (مُدخِل)  : يضيف عملاء مباشرةً، والفواتير/الدفعات تذهب
--                          للمراجعة (pending_entries) لا للجداول مباشرةً.
--    • worker2 (مراجِع)  : عند الموافقة يُدرج الفاتورة/الدفعة/الملغاة.
--    • المدير             : كل شيء.
--    • worker3/worker4/المشرف (اطّلاع فقط): لا يكتبون أي بيانات مالية.
--
--  ملاحظة مهمة: الدوال أدناه تعتمد على أسماء المستخدمين (worker2/3/4).
--  إن أضفت أو أعدت تسمية مستخدم «اطّلاع» أو «مراجِع» مستقبلاً، حدّث
--  الدالتين is_reviewer() و is_readonly_user() هنا ثم أعد تشغيل الملف.
-- =====================================================================

-- ---------- 1) دوال مساعدة (SECURITY DEFINER لتتجاوز RLS بأمان) ----------

-- هل المستخدم الحالي هو «المراجِع» (worker2)؟
create or replace function public.is_reviewer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and username = 'worker2'
  );
$$;

-- هل المستخدم الحالي «اطّلاع فقط» (worker3 / worker4 / أي مشرف)؟
-- هؤلاء يُمنعون من كتابة أي بيانات مالية.
create or replace function public.is_readonly_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (username in ('worker3','worker4') or role = 'supervisor')
  );
$$;

-- ---------- 2) العملاء: الإضافة لغير المطّلعين فقط ----------
-- يسمح للمُدخِل (worker1) والمراجِع والمدير؛ يمنع worker3/worker4/المشرف.
-- (التعديل/الحذف يبقيان للمدير فقط كما هما.)
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert to authenticated
  with check (not public.is_readonly_user());

-- ---------- 3) الفواتير: الإدراج المباشر للمدير أو المراجِع فقط ----------
-- worker1 لا يُدرج مباشرةً (يمرّ عبر المراجعة)، لذا لا يتأثّر سير العمل.
drop policy if exists bills_insert on public.bills;
create policy bills_insert on public.bills
  for insert to authenticated
  with check (public.is_manager() or public.is_reviewer());

-- ---------- 4) الدفعات: الإدراج المباشر للمدير أو المراجِع فقط ----------
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated
  with check (public.is_manager() or public.is_reviewer());

-- ---------- 5) الفواتير الملغية: الإدراج للمدير أو المراجِع فقط ----------
drop policy if exists cancelled_invoices_insert on public.cancelled_invoices;
create policy cancelled_invoices_insert on public.cancelled_invoices
  for insert to authenticated
  with check (public.is_manager() or public.is_reviewer());

-- ---------- 6) إدخالات المراجعة: الموافقة/الرفض للمدير أو المراجِع فقط ----------
-- كان أي مستخدم مسجّل يستطيع تغيير حالة الإدخال (موافقة/رفض) عبر الـ API.
-- الآن يقتصر ذلك على المراجِع والمدير. (الإنشاء يبقى متاحاً للمُدخِلين،
-- والحذف يبقى للمدير كما هو.)
drop policy if exists pending_entries_update on public.pending_entries;
create policy pending_entries_update on public.pending_entries
  for update to authenticated
  using (public.is_manager() or public.is_reviewer());

-- =====================================================================
--  ✅ بعد التشغيل، اختبر بسرعة (سجّل دخول بكل مستخدم وجرّب مهمته):
--    • worker1 : يضيف عميلاً جديداً ✔ ، ويرسل فاتورة «للمراجعة» ✔
--    • worker2 : يوافق على إدخال فيظهر في الحسابات ✔ ، ويرفض إدخالاً ✔
--    • المدير  : يضيف/يعدّل/يحذف فاتورة ودفعة ✔
--    • worker3/worker4 : يريان البيانات فقط ولا يظهر لهما زر إضافة ✔
--    • odai   : يرى كل شيء، ويوافق على الدخول، ولا يعدّل بيانات ✔
--  لا شيء يُحذف بهذا الملف؛ يغيّر صلاحيات الكتابة فقط.
-- =====================================================================


-- =====================================================================
--  ↩ للتراجع (استرجاع السماح السابق) — شغّل هذا القسم فقط عند الحاجة:
-- =====================================================================
-- drop policy if exists customers_insert on public.customers;
-- create policy customers_insert on public.customers
--   for insert to authenticated with check (true);
--
-- drop policy if exists bills_insert on public.bills;
-- create policy bills_insert on public.bills
--   for insert to authenticated with check (true);
--
-- drop policy if exists payments_insert on public.payments;
-- create policy payments_insert on public.payments
--   for insert to authenticated with check (true);
--
-- drop policy if exists cancelled_invoices_insert on public.cancelled_invoices;
-- create policy cancelled_invoices_insert on public.cancelled_invoices
--   for insert to authenticated with check (true);
--
-- drop policy if exists pending_entries_update on public.pending_entries;
-- create policy pending_entries_update on public.pending_entries
--   for update to authenticated using (true);
