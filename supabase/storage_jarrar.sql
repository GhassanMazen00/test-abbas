-- =====================================================================
--  تفعيل قسم «الجرار» في المخزن: الكود التلقائي + وزن الجرار + الصورة
--  شغّله مرة واحدة في SQL Editor (بعد ملفات المخزن السابقة). آمن للتكرار.
--
--  • code         : كود تلقائي (N101… للنايلون، P101… للعضم) — فريد
--  • unit_weight  : وزن الجرار الواحد بالغرام (الكمية بالغرام ÷ الوزن = عدد الجرارات)
--  • image        : صورة مصغّرة (تُصغَّر على الجهاز قبل الحفظ ≈ ٣٠–٥٠ كيلوبايت)
--  الصلاحيات (RLS) على storage_items تبقى كما هي — لا تغيير.
-- =====================================================================
alter table public.storage_items add column if not exists code        text    default '';
alter table public.storage_items add column if not exists unit_weight numeric default 0;
alter table public.storage_items add column if not exists image       text    default '';

-- منع تكرار الكود
create unique index if not exists storage_items_code_uniq
  on public.storage_items(code) where code <> '';

-- حماية من صور ضخمة (الحد ≈ ٤٠٠ كيلوبايت نصّاً)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'storage_items_image_len') then
    alter table public.storage_items add constraint storage_items_image_len check (char_length(image) <= 400000);
  end if;
end $$;
