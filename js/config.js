/* =========================================================
   إعدادات الاتصال بـ Supabase
   - عند ترك الحقلين فارغين يعمل التطبيق بالوضع التجريبي المحلي (localStorage)
   - المفتاح anon/public مخصّص للمتصفح والحماية عبر سياسات RLS في قاعدة البيانات
   ========================================================= */
window.APP_CONFIG = {
  SUPABASE_URL: "https://bjuaylhlqmfocpskvnjy.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqdWF5bGhscW1mb2Nwc2t2bmp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MTQzOTQsImV4cCI6MjA5OTk5MDM5NH0.Y9kZmtQ1mZJ3wFO1Xe-EHOMnLkE9Kqsfo-mn5rqi1rw",
  AUTH_EMAIL_DOMAIN: "azacounting.app", // يُلحق باسم المستخدم داخلياً لتسجيل الدخول
  REVIEWER_USERNAME: "worker2"          // الموظف المراجِع الذي يوافق على إدخالات بقية الموظفين
};
