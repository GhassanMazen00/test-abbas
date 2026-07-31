-- =====================================================================
--  AZ Accounting — تحصينات أمنية (شغّلها مرة واحدة في SQL Editor)
--  الهدف: منع أي مستخدم من رفع صلاحياته إلى «مدير» عبر التسجيل الذاتي،
--  وإغلاق أي ثغرة تتيح الدخول أو تغيير الدور بدون إذن.
-- =====================================================================

-- ---------- 1) منع تصعيد الصلاحيات عبر بيانات التسجيل ----------
-- الخطر: الدالة السابقة كانت تأخذ الدور من raw_user_meta_data ->> 'role'.
-- لو كان التسجيل الذاتي مفعّلاً، يستطيع أي شخص إنشاء حساب ويطلب لنفسه
-- الدور 'manager' فيحصل على كامل الصلاحيات. الإصلاح: تجاهُل أي دور يرسله
-- العميل تماماً، وجعل كل حساب جديد 'employee' افتراضياً دائماً.
-- تُرقّى الحسابات إلى مدير/مشرف يدوياً عبر SQL فقط (انظر القسم 3).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text := split_part(new.email, '@', 1);
begin
  if uname is null or uname = '' then
    uname := 'user_' || substr(new.id::text, 1, 8);
  end if;
  if exists (select 1 from public.profiles where username = uname) then
    uname := uname || '_' || substr(new.id::text, 1, 4);
  end if;

  -- الدور دائماً 'employee' — لا يُقرأ أي دور من بيانات المستخدم إطلاقاً.
  insert into public.profiles (id, username, role)
  values (new.id, uname, 'employee')
  on conflict (id) do nothing;

  return new;
exception
  when others then
    return new;
end;
$$;

-- ---------- 2) قفل عمود الدور ضد التعديل من طرف المستخدمين ----------
-- جدول profiles لديه سياسة SELECT فقط، ولا توجد سياسة UPDATE، لذا لا يستطيع
-- أي مستخدم عادي تغيير دوره عبر الـ API (RLS يرفض ما لا سياسة له). نضيف
-- كذلك حاجزاً على مستوى قاعدة البيانات لمنع تغيير الدور حتى لو أُضيفت سياسة
-- UPDATE مستقبلاً بالخطأ: أي محاولة لتغيير role من جلسة مستخدم تُرفض،
-- والترقية تتم فقط عبر دور الخدمة (service_role) أو SQL Editor.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null            -- استثناء: عمليات service_role / SQL Editor
     and not public.is_manager() then
    raise exception 'تغيير الدور غير مسموح';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_change on public.profiles;
create trigger trg_prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change();

-- ---------- 3) ترقية الحسابات المسموح لها (يدوياً وبشكل صريح) ----------
-- عدّل الأسماء أدناه حسب حساباتك الفعلية ثم شغّل هذا القسم عند الحاجة.
-- (loai = المدير، odai = المشرف). البقية تبقى employee.
update public.profiles set role = 'manager'    where username = 'loai';
update public.profiles set role = 'supervisor' where username = 'odai';

-- =====================================================================
--  خطوة يدوية مهمة في لوحة تحكم Supabase (لا يمكن فعلها عبر SQL):
--  Authentication → Providers → Email → أوقف "Allow new users to sign up"
--  (Disable public sign-ups). بذلك لا يستطيع أحد إنشاء حساب من الخارج،
--  وتُنشئ أنت حسابات الموظفين يدوياً فقط. هذا هو أقوى حاجز ضد الاختراق.
-- =====================================================================
