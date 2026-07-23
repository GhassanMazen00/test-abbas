/* =========================================================
   طبقة البيانات — تُخزَّن مؤقتاً في المتصفح (localStorage)
   لاحقاً سيتم استبدالها بواجهة برمجية للخادم (Back-end)
   ========================================================= */

const DB_KEY = "customer_accounts_db_v2";

/* أسماء العملاء التجريبية */
const DEMO_CUSTOMERS = [
  "تاون تيم",
  "ابو وسيم",
  "ابو محمد فادي",
  "فادي عكام",
  "العتال",
  "اتش جي ام",
  "زاهر السباعي",
  "عبد اله الحسامي",
  "الدمياطي",
  "باسل دقاق",
  "زوسر",
  "جي ات اس",
  "شريفة",
  "رضا شحاتة",
  "سامر المصري"
];

/* حسابات المستخدمين (تجريبية) */
const USERS = {
  "موظف":   { password: "1234", role: "employee", name: "الموظف" },
  "مدير":   { password: "1234", role: "manager",  name: "المدير" },
  "worker1": { password: "1234", role: "employee", name: "الموظف الأول" },
  "worker2": { password: "1234", role: "employee", name: "المراجِع" },
  "worker3": { password: "1234", role: "employee", name: "مطّلِع" }
};

/* تهيئة قاعدة البيانات لأول مرة */
function initDB() {
  let db = loadDB();
  if (!db) {
    db = {
      customers: DEMO_CUSTOMERS.map((name, i) => ({ id: i + 1, name })),
      bills: [],
      payments: [],
      cancelled: [],
      seq: { bill: 0, payment: 0, cancelled: 0 }
    };
    saveDB(db);
  }
  if (!db.cancelled) db.cancelled = [];
  if (db.seq && db.seq.cancelled == null) db.seq.cancelled = 0;
  return db;
}

/* قراءة/كتابة قاعدة البيانات */
function loadDB() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)); }
  catch (e) { return null; }
}
function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}
