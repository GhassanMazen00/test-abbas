-- =====================================================================
--  AZ Accounting — حقول المخزن الجديدة: رقم اللون + لقطة المواصفات بالسجل
--  شغّله مرة واحدة في SQL Editor (بعد ملفات المخزن السابقة). آمن للتكرار.
-- =====================================================================
alter table public.storage_items  add column if not exists color_num text default '';
alter table public.storage_events add column if not exists specs     text default '';
