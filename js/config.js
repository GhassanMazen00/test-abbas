/* =========================================================
   إعدادات الاتصال بـ Supabase
   - عند ترك الحقلين فارغين يعمل التطبيق بالوضع التجريبي المحلي (localStorage)
   - المفتاح anon/public مخصّص للمتصفح والحماية عبر سياسات RLS في قاعدة البيانات
   ========================================================= */
window.APP_CONFIG = {
  SUPABASE_URL: "https://bjuaylhlqmfocpskvnjy.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqdWF5bGhscW1mb2Nwc2t2bmp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MTQzOTQsImV4cCI6MjA5OTk5MDM5NH0.Y9kZmtQ1mZJ3wFO1Xe-EHOMnLkE9Kqsfo-mn5rqi1rw",
  AUTH_EMAIL_DOMAIN: "azacounting.app", // يُلحق باسم المستخدم داخلياً لتسجيل الدخول
  REVIEWER_USERNAME: "worker2",         // الموظف المراجِع الذي يوافق على إدخالات بقية الموظفين
  VIEWER_USERNAME: "worker3",           // موظف الاطّلاع فقط (بحث + رصيد وفواتير العميل دون تعديل)
  SUPERVISOR_USERNAME: "odai",          // مشرف: يرى كل ما يراه المدير (قراءة فقط) + موافقة الدخول وإدارة الجلسات
  BILLS_VIEWER_USERNAME: "worker4",     // عرض الفواتير فقط: بحث عن عميل ثم عرض فواتيره (بأعمدة محدودة) دون تعديل

  // مفتاح موقع Cloudflare Turnstile (CAPTCHA) — عام وآمن في المتصفح.
  // اتركه فارغاً = مُعطّل تماماً (لا يظهر أي تحقق). ضع المفتاح لتفعيل التحقق
  // في شاشة الدخول. لا تفعّل «Captcha protection» في Supabase إلا بعد وضع
  // هذا المفتاح ونشره، وإلا ستفشل كل عمليات الدخول.
  CAPTCHA_SITE_KEY: "0x4AAAAAAEDHG49zj73HSKMx"
};
