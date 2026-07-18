/* =========================================================
   طبقة البيانات — تُخزَّن مؤقتاً في المتصفح (localStorage)
   لاحقاً سيتم استبدالها بواجهة برمجية للخادم (Back-end)
   ========================================================= */

const DB_KEY = "customer_accounts_db_v1";

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
  "موظف": { password: "1234", role: "employee", name: "الموظف" },
  "مدير": { password: "1234", role: "manager",  name: "المدير" }
};

/* تهيئة قاعدة البيانات لأول مرة */
function initDB() {
  let db = loadDB();
  if (!db) {
    db = {
      customers: DEMO_CUSTOMERS.map((name, i) => ({ id: i + 1, name })),
      bills: [],
      payments: [],
      seq: { bill: 0, payment: 0 }
    };
    seedSampleTransactions(db);
    saveDB(db);
  }
  return db;
}

/* بعض الحركات التجريبية لتظهر التقارير بشكل واقعي */
function seedSampleTransactions(db) {
  const today = new Date();
  const d = (offset) => {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - offset);
    return dt.toISOString();
  };

  const addBill = (custId, items, offset) => {
    db.seq.bill++;
    const total = items.reduce((s, it) => s + it.count * it.price, 0);
    db.bills.push({ id: db.seq.bill, customerId: custId, date: d(offset), items, total });
  };
  const addPayment = (custId, amount, note, offset) => {
    db.seq.payment++;
    db.payments.push({ id: db.seq.payment, customerId: custId, date: d(offset), amount, note });
  };

  addBill(1, [
    { description: "أسمنت", count: 10, price: 5000 },
    { description: "رمل", count: 4, price: 3000 }
  ], 0);
  addBill(1, [{ description: "حديد تسليح", count: 2, price: 40000 }], 5);
  addPayment(1, 30000, "دفعة نقدية", 3);

  addBill(2, [{ description: "دهان", count: 6, price: 8000 }], 0);
  addPayment(2, 20000, "تحويل بنكي", 1);

  addBill(4, [
    { description: "بلاط", count: 20, price: 2500 },
    { description: "مونة", count: 8, price: 1500 }
  ], 12);
  addPayment(4, 15000, "", 10);

  addBill(7, [{ description: "خشب", count: 5, price: 12000 }], 32);
  addBill(9, [{ description: "زجاج", count: 3, price: 9000 }], 40);
  addPayment(9, 27000, "تسديد كامل", 38);
}

/* قراءة/كتابة قاعدة البيانات */
function loadDB() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)); }
  catch (e) { return null; }
}
function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}
