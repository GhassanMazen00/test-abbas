/* =========================================================
   إعدادات الاتصال بـ Supabase
   - املأ القيمتين التاليتين من: Supabase → Project Settings → API
   - عند تركهما فارغتين يعمل التطبيق في الوضع التجريبي المحلي (localStorage)
   ========================================================= */
window.APP_CONFIG = {
  SUPABASE_URL: "",         // مثال: https://abcd1234.supabase.co
  SUPABASE_ANON_KEY: "",    // المفتاح العام (anon / public)
  AUTH_EMAIL_DOMAIN: "azacounting.app" // يُلحق باسم المستخدم داخلياً لتسجيل الدخول
};
