-- =====================================================================
--  AZ Accounting — ترقية: بنود المرتجع + حذف الإدخالات المرفوضة
--  شغّل هذا الملف مرة واحدة في: Supabase Dashboard → SQL Editor (آمن للتكرار)
-- =====================================================================

-- 1) عمود بنود المرتجع (ليكون المرتجع مطابقاً للفاتورة)
alter table public.payments add column if not exists items jsonb default '[]'::jsonb;

-- 2) حذف الإدخالات المرفوضة من صلاحية المدير فقط
drop policy if exists pending_entries_delete on public.pending_entries;
create policy pending_entries_delete on public.pending_entries
  for delete to authenticated using (public.is_manager());

-- =====================================================================
--  انتهى.
-- =====================================================================
