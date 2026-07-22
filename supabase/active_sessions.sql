-- =====================================================================
--  AZ Accounting — الجلسات النشطة (إدارة المستخدمين للمدير)
--  يعرض من متصل الآن وجهازه، ويتيح للمدير تسجيل خروجه.
--  شغّل هذا الملف مرة واحدة في: Supabase Dashboard → SQL Editor (آمن للتكرار)
-- =====================================================================

create table if not exists public.active_sessions (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  username   text,
  device     text,
  last_seen  timestamptz not null default now(),
  signed_out boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists active_sessions_lastseen_idx on public.active_sessions(last_seen);

alter table public.active_sessions enable row level security;

-- كل مستخدم يُنشئ جلسته ويحدّث نبضها؛ القراءة/التحديث/الحذف لصاحبها أو للمدير
drop policy if exists active_sessions_insert on public.active_sessions;
create policy active_sessions_insert on public.active_sessions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists active_sessions_select on public.active_sessions;
create policy active_sessions_select on public.active_sessions
  for select to authenticated using (user_id = auth.uid() or public.is_manager());
drop policy if exists active_sessions_update on public.active_sessions;
create policy active_sessions_update on public.active_sessions
  for update to authenticated using (user_id = auth.uid() or public.is_manager());
drop policy if exists active_sessions_delete on public.active_sessions;
create policy active_sessions_delete on public.active_sessions
  for delete to authenticated using (user_id = auth.uid() or public.is_manager());

-- =====================================================================
--  انتهى. سيظهر تبويب «المستخدمون» للمدير.
-- =====================================================================
