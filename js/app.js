/* =========================================================
   منطق التطبيق — واجهة أمامية بالكامل
   ========================================================= */

/* في وضع الخادم تبدأ الذاكرة فارغة وتُملأ بعد تسجيل الدخول؛ محلياً تُحمّل من المتصفح */
let DB = (Store.mode === "supabase")
  ? { customers: [], bills: [], payments: [], seq: { bill: 0, payment: 0 } }
  : initDB();
let currentUser = null;

/* ---------- الأدوار ---------- */
const REVIEWER_USERNAME = (window.APP_CONFIG && window.APP_CONFIG.REVIEWER_USERNAME) || "worker2";
const VIEWER_USERNAME = (window.APP_CONFIG && window.APP_CONFIG.VIEWER_USERNAME) || "worker3";
function isReviewer(u) { u = u || currentUser; return !!u && u.role !== "manager" && u.username === REVIEWER_USERNAME; }
function isViewer(u) { u = u || currentUser; return !!u && u.role !== "manager" && u.username === VIEWER_USERNAME; }
function isMaker(u) { u = u || currentUser; return !!u && u.role === "employee" && u.username !== REVIEWER_USERNAME && u.username !== VIEWER_USERNAME; }

/* ---------- أدوات مساعدة ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------- الوضع الليلي ---------- */
function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}
function applyThemeIcon() {
  const isDark = currentTheme() === "dark";
  const icon = isDark ? "☀️" : "🌙";
  const title = isDark ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الليلي";
  ["#theme-toggle", "#login-theme-toggle"].forEach((sel) => {
    const btn = $(sel);
    if (btn) { btn.textContent = icon; btn.title = title; }
  });
}
function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("app_theme", next); } catch (e) {}
  applyThemeIcon();
}
applyThemeIcon();
["#theme-toggle", "#login-theme-toggle"].forEach((sel) => {
  const btn = $(sel);
  if (btn) btn.addEventListener("click", toggleTheme);
});

function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString("ar-EG") + " ج.م";
}
const APP_TZ = "Africa/Cairo"; // كل التواريخ تُعرض بتوقيت مصر بغضّ النظر عن جهاز المستخدم
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", timeZone: APP_TZ });
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", timeZone: APP_TZ }) +
    " - " + d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: APP_TZ });
}
/* مفاتيح اليوم/الشهر بتوقيت مصر (YYYY-MM-DD / YYYY-MM) */
function cairoDayKey(iso) { return new Date(iso).toLocaleDateString("en-CA", { timeZone: APP_TZ }); }
function cairoMonthKey(iso) { return cairoDayKey(iso).slice(0, 7); }
function customerById(id) {
  return DB.customers.find((c) => c.id === id);
}
function billsOf(id) { return DB.bills.filter((b) => b.customerId === id); }
function paymentsOf(id) { return DB.payments.filter((p) => p.customerId === id); }
function totalBills(id) { return billsOf(id).reduce((s, b) => s + b.total, 0); }
function totalPayments(id) { return paymentsOf(id).reduce((s, p) => s + p.amount, 0); }
function balanceOf(id) { return totalBills(id) - totalPayments(id); }

/* ---------- أنواع الحركات الدائنة ---------- */
const PAY_KINDS = {
  payment:  { label: "دفعة",  badge: "badge-success" },
  transfer: { label: "ترحيل", badge: "badge-transfer" },
  discount: { label: "خصم",   badge: "badge-warning" },
  return:   { label: "مرتجع", badge: "badge-warning" }
};
function kindOf(p) { return PAY_KINDS[p.kind] ? p.kind : "payment"; }
function kindLabel(k) { return (PAY_KINDS[k] || PAY_KINDS.payment).label; }
function kindBadge(k) { const d = PAY_KINDS[k] || PAY_KINDS.payment; return `<span class="badge ${d.badge}">${d.label}</span>`; }
function docCell(d) { return d ? String(d) : "—"; }
function sumKind(id, k) { return paymentsOf(id).filter((p) => kindOf(p) === k).reduce((s, p) => s + p.amount, 0); }

const MONTH_NAMES = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
let lastManagerTab = "clients"; // لتذكّر التبويب عند العودة من صفحة العميل
let profileCustId = null;       // العميل المفتوح ملفه حالياً
let currentSub = null;          // الصفحة الفرعية الحالية { custId, type }

/* =========================================================
   بحث تقريبي بالأسماء (يتحمّل اختلاف حرف أو اثنين ويعيد عدة نتائج)
   ========================================================= */
function normSearch(s) {
  return String(s == null ? "" : s)
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/ة/g, "ه").replace(/[ًٌٍَُِّْـ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function editDist(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[n];
}
/* نتيجة أقل = تطابق أفضل، و-1 = لا يوجد تطابق */
function nameMatchScore(query, name) {
  const q = normSearch(query), t = normSearch(name);
  if (!q) return 0;
  if (t.includes(q)) return t.indexOf(q); // احتواء مباشر: الأفضل
  const maxD = q.length < 3 ? 0 : 2;       // اسمح باختلاف حتى حرفين
  if (maxD === 0) return -1;
  let best = editDist(q, t);
  for (const tok of t.split(" ")) {
    if (!tok) continue;
    if (tok.includes(q)) { best = Math.min(best, 1); continue; }
    best = Math.min(best, editDist(q, tok));
    if (tok.length > q.length) {
      for (let i = 0; i + q.length <= tok.length; i++) {
        best = Math.min(best, editDist(q, tok.slice(i, i + q.length)));
      }
    }
  }
  return best <= maxD ? 100 + best : -1;
}
function matchCustomers(query) {
  const scored = [];
  for (const c of DB.customers) {
    const s = nameMatchScore(query, c.name);
    if (s >= 0) scored.push({ c, s });
  }
  scored.sort((a, b) => a.s - b.s || a.c.name.localeCompare(b.c.name, "ar"));
  return scored.map((x) => x.c);
}

/* =========================================================
   نافذة تفاصيل الفواتير (لليوم/الشهر) — أعمدة مختصرة فقط
   ========================================================= */
function billRowsCompact(bills) {
  const sorted = bills.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!sorted.length) return '<tr><td colspan="4" class="empty-msg">لا توجد فواتير.</td></tr>';
  return sorted.map((b) => {
    const cust = customerById(b.customerId);
    return `<tr>
      <td class="num">${b.docNo ? b.docNo : ("#" + b.id)}</td>
      <td>${fmtDate(b.date)}</td>
      <td>${cust ? cust.name : "—"}</td>
      <td class="num">${fmtMoney(b.total)}</td>
    </tr>`;
  }).join("");
}
function showBillsModal(title, bills) {
  const total = bills.reduce((s, b) => s + b.total, 0);
  openModal(title, `
    <p class="info-line">عدد الفواتير: <b>${bills.length.toLocaleString("ar-EG")}</b> — الإجمالي: <b>${fmtMoney(total)}</b></p>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>اسم العميل</th><th>قيمة الفاتورة</th></tr></thead>
        <tbody>${billRowsCompact(bills)}</tbody>
      </table>
    </div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">إغلاق</button></div>
  `);
}
function openDayBills(key) {
  const bills = DB.bills.filter((b) => cairoDayKey(b.date) === key);
  showBillsModal("مبيعات يوم " + fmtDate(key + "T12:00:00Z"), bills);
}
function openMonthBills(key) {
  const bills = DB.bills.filter((b) => cairoMonthKey(b.date) === key);
  const parts = key.split("-");
  showBillsModal("مبيعات " + MONTH_NAMES[parseInt(parts[1], 10) - 1] + " " + parts[0], bills);
}

/* إظهار واجهة واحدة فقط من واجهات التطبيق */
function showOnlyView(viewId) {
  ["employee-view", "manager-view", "client-view", "subpage-view", "review-view", "viewer-view"].forEach((v) => {
    const el = document.getElementById(v);
    if (el) el.classList.toggle("hidden", v !== viewId);
  });
}

/* ---------- نافذة التأكيد (طبقة مستقلة فوق النماذج) ---------- */
function confirmDialog(title, message, onYes, opts) {
  opts = opts || {};
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  const yes = $("#confirm-yes");
  yes.textContent = opts.yesLabel || "تأكيد";
  yes.className = "btn " + (opts.danger ? "btn-danger" : "btn-success");
  yes.onclick = () => { hideConfirm(); onYes(); };
  $("#confirm-overlay").classList.remove("hidden");
}
function hideConfirm() { $("#confirm-overlay").classList.add("hidden"); }

/* ---------- حذف البيانات (بتأكيد) ---------- */
function deleteBill(id) {
  confirmDialog("حذف فاتورة", "هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن العملية.", async () => {
    try { await Store.deleteBill(id); toast("تم حذف الفاتورة"); refreshSubpage(); }
    catch (e) { toast(errMsg(e, "تعذّر حذف الفاتورة"), true); }
  }, { danger: true, yesLabel: "تأكيد الحذف" });
}
function deletePayment(id) {
  confirmDialog("حذف دفعة", "هل أنت متأكد من حذف هذه الدفعة؟ لا يمكن التراجع عن العملية.", async () => {
    try { await Store.deletePayment(id); toast("تم حذف الدفعة"); refreshSubpage(); }
    catch (e) { toast(errMsg(e, "تعذّر حذف الدفعة"), true); }
  }, { danger: true, yesLabel: "تأكيد الحذف" });
}
function deleteCustomer(id) {
  const c = customerById(id);
  confirmDialog("حذف العميل", `سيتم حذف العميل «${c.name}» وكل فواتيره ودفعاته. هل أنت متأكد؟`, async () => {
    try { await Store.deleteCustomer(id); toast("تم حذف العميل"); renderManager(); }
    catch (e) { toast(errMsg(e, "تعذّر حذف العميل"), true); }
  }, { danger: true, yesLabel: "تأكيد الحذف" });
}

/* رسالة خطأ مختصرة (مع تلميح لصلاحيات المدير) */
function errMsg(e, fallback) {
  const m = (e && (e.message || e.error_description || e.hint)) || "";
  if (/row-level security|permission|not allowed|policy/i.test(m)) return "لا تملك صلاحية هذه العملية";
  return fallback || m || "حدث خطأ";
}

/* ---------- إدارة العملاء (إضافة/تعديل بتأكيد) ---------- */
function nextCustomerId() {
  return DB.customers.reduce((m, c) => Math.max(m, c.id), 0) + 1;
}
function addCustomerForm() { customerForm(null); }
function editCustomerForm(id) { customerForm(id); }
function customerForm(editId) {
  const editing = editId != null;
  const c = editing ? customerById(editId) : null;
  openModal(editing ? "تعديل عميل" : "عميل جديد", `
    <div class="field">
      <label>اسم العميل</label>
      <input type="text" id="cust-name" placeholder="اسم العميل" value="${editing ? c.name.replace(/"/g, "&quot;") : ""}" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-success" onclick="saveCustomer(${editing ? editId : "null"})">حفظ</button>
      <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    </div>
  `);
  setTimeout(() => $("#cust-name") && $("#cust-name").focus(), 50);
}
function saveCustomer(editId) {
  const name = $("#cust-name").value.trim();
  if (!name) { toast("الرجاء إدخال اسم العميل", true); return; }
  const editing = editId != null;
  confirmDialog(
    editing ? "تأكيد التعديل" : "تأكيد الإضافة",
    editing ? `هل تريد حفظ التعديل على اسم العميل إلى «${name}»؟` : `هل تريد إضافة العميل «${name}»؟`,
    () => commitCustomer(editing ? editId : null, name)
  );
}
async function commitCustomer(editId, name) {
  try {
    if (editId != null) {
      await Store.updateCustomer(editId, name);
      closeModal(); toast("تم تعديل بيانات العميل");
      if (currentUser && currentUser.role === "manager") renderManager();
    } else {
      await Store.addCustomer(name);
      closeModal(); toast("تمت إضافة العميل");
      if (currentUser && currentUser.role === "employee") {
        $("#employee-search").value = name;
        doEmployeeSearch();
      } else {
        renderManager();
      }
    }
  } catch (e) { toast(errMsg(e, "تعذّر حفظ العميل"), true); }
}

function toast(msg, danger) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (danger ? " danger" : "");
  setTimeout(() => t.classList.add("hidden"), 2600);
}

/* ---------- تسجيل الدخول ---------- */
/* ---------- كشف نوع الجهاز ---------- */
function deviceInfo() {
  const ua = navigator.userAgent || "";
  let os = "نظام غير معروف";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  let browser = "متصفح";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  const type = /iPad|Tablet/i.test(ua) ? "جهاز لوحي" : (/Mobile|iPhone|Android/i.test(ua) ? "هاتف" : "حاسوب");
  return `${type} — ${os} — ${browser}`;
}

const APPROVED_KEY = "az_login_approved";
let pendingRequests = [];
let reqPollTimer = null;
let waitTimer = null;

/* إتمام الدخول بعد التحقق (وبعد الموافقة إن لزم) */
async function finishLogin() {
  try { await Store.loadAll(); } catch (e) { toast(errMsg(e, "تعذّر تحميل البيانات"), true); }
  startApp();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const u = $("#username").value.trim();
  const p = $("#password").value;
  const btn = $("#login-form button[type=submit]");
  if (!u || !p) { $("#login-error").textContent = "الرجاء إدخال اسم المستخدم وكلمة المرور"; return; }
  $("#login-error").textContent = "";
  btn.disabled = true;
  const label = btn.textContent; btn.textContent = "جارٍ الدخول...";
  try {
    const sess = await Store.signIn(u, p);
    currentUser = { username: sess.username, role: sess.role, userId: sess.userId };
    $("#login-form").reset();
    try { localStorage.removeItem(APPROVED_KEY); } catch (er) {}
    // المدير يدخل مباشرة؛ الموظف ينتظر موافقة المدير
    if (currentUser.role !== "manager") {
      let reqId = null;
      try {
        const r = await Store.createLoginRequest(sess.userId, sess.username, deviceInfo());
        reqId = r && r.id;
      } catch (er) { reqId = null; } // جدول الطلبات غير موجود بعد → دخول مباشر (حتى لا يتعطّل التطبيق)
      if (reqId != null) { startWaiting(reqId); return; }
    }
    await finishLogin();
  } catch (err) {
    $("#login-error").textContent = (err && err.message) ? err.message : "تعذّر تسجيل الدخول";
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
});

$("#logout-btn").addEventListener("click", async () => {
  stopRequestPolling();
  stopReviewPolling();
  stopMakerPolling();
  try { localStorage.removeItem(APPROVED_KEY); } catch (e) {}
  await Store.signOut();
  currentUser = null;
  $("#app").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
});

/* استعادة الجلسة تلقائياً في وضع الخادم (بدون إعادة تسجيل دخول) */
(async function restoreSession() {
  if (Store.mode !== "supabase") return;
  try {
    const sess = await Store.restoreSession();
    if (!sess) return;
    currentUser = { username: sess.username, role: sess.role, userId: sess.userId };
    // الموظف يحتاج موافقة إن لم يكن قد وُوفق على جلسته
    let approved = false;
    try { approved = localStorage.getItem(APPROVED_KEY) === "1"; } catch (e) {}
    if (currentUser.role !== "manager" && !approved) {
      let reqId = null;
      try { const r = await Store.createLoginRequest(sess.userId, sess.username, deviceInfo()); reqId = r && r.id; } catch (er) { reqId = null; }
      if (reqId != null) { startWaiting(reqId); return; }
    }
    await finishLogin();
  } catch (e) { /* تجاهل */ }
})();

/* ---------- شاشة انتظار موافقة المدير (جهة الموظف) ---------- */
function startWaiting(reqId) {
  $("#login-screen").classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#waiting-screen").classList.remove("hidden");
  if (waitTimer) clearInterval(waitTimer);
  waitTimer = setInterval(async () => {
    let st;
    try { st = await Store.getLoginRequestStatus(reqId); } catch (e) { return; }
    if (st === "approved") {
      clearInterval(waitTimer); waitTimer = null;
      try { localStorage.setItem(APPROVED_KEY, "1"); } catch (e) {}
      $("#waiting-screen").classList.add("hidden");
      await finishLogin();
    } else if (st === "rejected") {
      clearInterval(waitTimer); waitTimer = null;
      try { localStorage.removeItem(APPROVED_KEY); } catch (e) {}
      await Store.signOut();
      currentUser = null;
      $("#waiting-screen").classList.add("hidden");
      $("#login-screen").classList.remove("hidden");
      $("#login-error").textContent = "تم رفض طلب الدخول من قبل المدير";
    }
  }, 3000);
}
async function cancelWaiting() {
  if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
  try { localStorage.removeItem(APPROVED_KEY); } catch (e) {}
  try { await Store.signOut(); } catch (e) {}
  currentUser = null;
  $("#waiting-screen").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
}

function startApp() {
  $("#login-screen").classList.add("hidden");
  $("#waiting-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  const roleLabel = currentUser.role === "manager" ? "المدير" : (isReviewer() ? "المراجِع" : (isViewer() ? "مطّلِع" : "الموظف"));
  $("#current-user").textContent = roleLabel + ": " + currentUser.username;

  if (currentUser.role === "manager") {
    document.querySelector('.tab[data-tab="requests"]').classList.remove("hidden");
    showOnlyView("manager-view");
    renderManager();
    startRequestPolling();
  } else if (isReviewer()) {
    showOnlyView("review-view");
    renderReview();
    startReviewPolling();
  } else if (isViewer()) {
    showOnlyView("viewer-view");
    viewerBackToSearch();
    $("#viewer-search").value = "";
    $("#viewer-results").innerHTML = '<p class="empty-msg">اكتب اسم العميل في الأعلى ثم اضغط بحث.</p>';
  } else {
    showOnlyView("employee-view");
    empShow("add");
    $("#employee-search").value = "";
    $("#employee-results").innerHTML =
      '<p class="empty-msg">اكتب اسم العميل في الأعلى ثم اضغط بحث.</p>';
    startMakerPolling();
  }
}

/* =========================================================
   مراجعة الإدخالات (worker1 يرسل → worker2 يراجع)
   ========================================================= */
let reviewPollTimer = null, makerPollTimer = null;
let pendingEntries = [], rejectedEntries = [];

function entryKindBadge(k) {
  if (k === "bill") return '<span class="badge badge-danger">فاتورة</span>';
  if (k === "return") return '<span class="badge badge-warning">مرتجع</span>';
  return '<span class="badge badge-success">دفعة</span>';
}
function entryHasItems(e) { return Array.isArray(e.payload.items) && e.payload.items.length > 0; }
function entryAmount(e) {
  return e.payload.total != null ? e.payload.total : (e.payload.amount || 0);
}
function entryDetail(e) {
  const doc = e.payload.docNo ? ("رقم: " + e.payload.docNo) : "بدون رقم";
  if (entryHasItems(e)) {
    const n = e.payload.items.reduce((s, it) => s + (Number(it.count) || 0), 0);
    return `${doc} — ${e.payload.items.length} صنف / ${n.toLocaleString("ar-EG")} قطعة`;
  }
  return `${doc}${e.payload.note ? " — " + e.payload.note : ""}`;
}

/* --------- تفاصيل إدخال (فاتورة/دفعة/مرتجع) --------- */
function entryDetailBody(e) {
  const meta = `<p class="info-line">المُدخِل: <b>${e.createdBy || "—"}</b> — الوقت: ${e.created_at ? fmtDateTime(e.created_at) : "—"}</p>`;
  if (entryHasItems(e)) {
    const items = e.payload.items;
    const rows = items.map((it) => `
      <tr>
        <td>${it.description || "—"}</td>
        <td>${it.size || "—"}</td>
        <td class="num">${(Number(it.count) || 0).toLocaleString("ar-EG")}</td>
        <td class="num">${fmtMoney(it.price)}</td>
        <td class="num">${fmtMoney((Number(it.count) || 0) * (Number(it.price) || 0))}</td>
      </tr>`).join("");
    return `
      <p class="info-line">العميل: <b>${e.customerName || "—"}</b> &nbsp;•&nbsp; النوع: <b>${e.kind === "return" ? "مرتجع" : "فاتورة"}</b> &nbsp;•&nbsp; الرقم: <b>${e.payload.docNo || "—"}</b></p>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>وصف الصنف</th><th>المقاس</th><th>العدد</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="bill-total-row"><span>المجموع الكلي</span><span class="num">${fmtMoney(e.payload.total || 0)}</span></div>
      ${meta}`;
  }
  const word = e.payload.kind === "discount" ? "خصم" : (e.kind === "return" ? "مرتجع" : "دفعة");
  return `
    <p class="info-line">العميل: <b>${e.customerName || "—"}</b></p>
    <div class="detail-grid">
      <div><span>النوع</span><b>${word}</b></div>
      <div><span>القيمة</span><b>${fmtMoney(entryAmount(e))}</b></div>
      <div><span>الرقم</span><b>${e.payload.docNo || "—"}</b></div>
      <div><span>ملاحظة</span><b>${e.payload.note || "—"}</b></div>
    </div>
    ${meta}`;
}
function entryTitle(e) {
  return e.kind === "bill" ? "تفاصيل الفاتورة" : (e.kind === "return" ? "تفاصيل المرتجع" : "تفاصيل الدفعة");
}
function showEntryDetails(id) {
  const e = findEntry(id);
  if (!e) return;
  openModal(entryTitle(e) + " — بانتظار المراجعة", entryDetailBody(e) + `
    <div class="modal-actions">
      <button class="btn btn-success" onclick="closeModal(); approveEntry(${e.id})">موافقة</button>
      <button class="btn btn-danger" onclick="closeModal(); rejectEntry(${e.id})">رفض</button>
      <button class="btn btn-outline" onclick="closeModal()">إغلاق</button>
    </div>`);
}
function showRejectedDetails(id) {
  const e = rejectedEntries.find((x) => x.id === id);
  if (!e) return;
  openModal(entryTitle(e) + " — مرفوض", entryDetailBody(e) + `
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">إغلاق</button></div>`);
}

/* --------- جهة المراجِع (worker2) --------- */
function renderReview() {
  const rows = pendingEntries.length ? pendingEntries.map((e) => `
    <tr class="clickable-row" onclick="showEntryDetails(${e.id})">
      <td>${entryKindBadge(e.kind)}</td>
      <td>${e.customerName || "—"}</td>
      <td>${entryDetail(e)}</td>
      <td class="num">${fmtMoney(entryAmount(e))}</td>
      <td>${e.createdBy || "—"}</td>
      <td>${e.created_at ? fmtDateTime(e.created_at) : "—"}</td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); showEntryDetails(${e.id})">تفاصيل</button>
        <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); approveEntry(${e.id})">موافقة</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); rejectEntry(${e.id})">رفض</button>
      </td>
    </tr>`).join("") : '<tr><td colspan="7" class="empty-msg">لا توجد إدخالات بانتظار المراجعة.</td></tr>';
  $("#review-content").innerHTML = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">بانتظار المراجعة</div>
        <div class="stat-value">${pendingEntries.length.toLocaleString("ar-EG")}</div>
      </div>
    </div>
    <p class="info-line">راجع كل إدخال ثم وافق (يُضاف للنظام) أو ارفض (يعود للموظف في قائمة المرفوضات). يُحدَّث تلقائياً.</p>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>النوع</th><th>العميل</th><th>التفاصيل</th><th>القيمة</th><th>المُدخِل</th><th>الوقت</th><th>القرار</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
async function refreshReview() {
  if (!isReviewer()) return;
  try { pendingEntries = await Store.listPendingEntries(); } catch (e) { return; }
  renderReview();
}
function startReviewPolling() { stopReviewPolling(); refreshReview(); reviewPollTimer = setInterval(refreshReview, 5000); }
function stopReviewPolling() { if (reviewPollTimer) { clearInterval(reviewPollTimer); reviewPollTimer = null; } }
function findEntry(id) { return pendingEntries.find((e) => e.id === id); }
async function approveEntry(id) {
  const e = findEntry(id);
  if (!e) return;
  try {
    if (e.kind === "bill") {
      await Store.addBill(e.customerId, e.payload.items, e.payload.total, e.payload.docNo);
    } else {
      const amt = e.payload.total != null ? e.payload.total : (e.payload.amount || 0);
      const kind = e.payload.kind || (e.kind === "return" ? "return" : "payment");
      await Store.addPayment(e.customerId, amt, e.payload.note || "", e.payload.docNo, kind, e.payload.items || []);
    }
    await Store.decidePendingEntry(id, true, currentUser.username);
    toast("تمت الموافقة وأُضيف للنظام");
    await refreshReview();
  } catch (err) { toast(errMsg(err, "تعذّر تنفيذ الموافقة"), true); }
}
async function rejectEntry(id) {
  try {
    await Store.decidePendingEntry(id, false, currentUser.username);
    toast("تم رفض الإدخال");
    await refreshReview();
  } catch (err) { toast(errMsg(err, "تعذّر الرفض"), true); }
}

/* --------- جهة الموظف (worker1): المرفوضات --------- */
function empShow(which) {
  $("#emp-add").classList.toggle("hidden", which !== "add");
  $("#emp-rejected").classList.toggle("hidden", which !== "rejected");
  $$('#employee-view .tab').forEach((t) => t.classList.toggle("active", t.dataset.emp === which));
  if (which === "rejected") renderRejected();
}
function updateRejBadge(n) {
  const b = $("#rej-badge");
  if (!b) return;
  b.textContent = n;
  b.classList.toggle("hidden", !n);
}
function renderRejected() {
  const rows = rejectedEntries.length ? rejectedEntries.map((e) => `
    <tr class="clickable-row" onclick="showRejectedDetails(${e.id})">
      <td>${entryKindBadge(e.kind)}</td>
      <td>${e.customerName || "—"}</td>
      <td>${entryDetail(e)}</td>
      <td class="num">${fmtMoney(entryAmount(e))}</td>
      <td>${e.decided_at ? fmtDateTime(e.decided_at) : "—"}</td>
    </tr>`).join("") : '<tr><td colspan="5" class="empty-msg">لا توجد إدخالات مرفوضة.</td></tr>';
  $("#emp-rejected").innerHTML = `
    <p class="info-line">إدخالات رفضها المراجِع. يمكنك إعادة إدخالها بشكل صحيح من تبويب «إضافة». (حذفها من صلاحية المدير)</p>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>النوع</th><th>العميل</th><th>التفاصيل</th><th>القيمة</th><th>وقت الرفض</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
async function refreshMaker() {
  if (!isMaker()) return;
  try { rejectedEntries = await Store.listRejectedEntries(currentUser.username); } catch (e) { return; }
  updateRejBadge(rejectedEntries.length);
  if (!$("#emp-rejected").classList.contains("hidden")) renderRejected();
}
function startMakerPolling() { stopMakerPolling(); refreshMaker(); makerPollTimer = setInterval(refreshMaker, 6000); }
function stopMakerPolling() { if (makerPollTimer) { clearInterval(makerPollTimer); makerPollTimer = null; } }

/* =========================================================
   واجهة الاطّلاع فقط (worker3): بحث + رصيد وفواتير دون تعديل/حذف
   ========================================================= */
function doViewerSearch() {
  const q = $("#viewer-search").value.trim();
  const box = $("#viewer-results");
  if (!q) { box.innerHTML = '<p class="empty-msg">الرجاء كتابة اسم العميل للبحث.</p>'; return; }
  const matches = matchCustomers(q);
  if (!matches.length) { box.innerHTML = '<p class="empty-msg">لا يوجد عميل بهذا الاسم.</p>'; return; }
  box.innerHTML = matches.map((c) => `
    <div class="result-card clickable-row" onclick="openViewerProfile(${c.id})">
      <div class="result-name">${c.name}</div>
      <div class="result-actions"><span class="nav-cell">عرض ›</span></div>
    </div>`).join("");
}
function viewerBackToSearch() {
  $("#viewer-profile-panel").classList.add("hidden");
  $("#viewer-search-panel").classList.remove("hidden");
}
function openViewerProfile(custId) {
  renderViewerProfile(custId);
  $("#viewer-search-panel").classList.add("hidden");
  $("#viewer-profile-panel").classList.remove("hidden");
  window.scrollTo(0, 0);
}
function renderViewerProfile(custId) {
  const c = customerById(custId);
  if (!c) return;
  const bal = balanceOf(custId);
  const balCls = bal > 0 ? "pos" : "zero";
  const statusBadge = bal > 0
    ? '<span class="badge badge-danger">مستحق عليه</span>'
    : '<span class="badge badge-success">مسدَّد بالكامل</span>';
  const bills = billsOf(custId).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const rows = bills.length ? bills.map((b) => `
    <tr>
      <td class="num">${docCell(b.docNo)}</td>
      <td>${fmtDate(b.date)}</td>
      <td>${b.items.map((it) => `${it.description}${it.size ? " (" + it.size + ")" : ""} × ${it.count.toLocaleString("ar-EG")}`).join("<br>")}</td>
      <td class="num">${b.items.map((it) => fmtMoney(it.price)).join("<br>")}</td>
      <td class="num">${b.items.reduce((x, it) => x + it.count, 0).toLocaleString("ar-EG")}</td>
      <td class="num">${fmtMoney(b.total)}</td>
    </tr>`).join("") : '<tr><td colspan="6" class="empty-msg">لا توجد فواتير.</td></tr>';
  $("#viewer-profile-content").innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${c.name.trim().charAt(0)}</div>
      <div>
        <h2 class="profile-name">${c.name}</h2>
        <div class="profile-meta">${statusBadge}</div>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">الرصيد المستحق</div>
        <div class="stat-value ${balCls}">${fmtMoney(bal)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">عدد الفواتير</div>
        <div class="stat-value">${bills.length.toLocaleString("ar-EG")}</div>
      </div>
    </div>
    <h4 class="nav-cards-title">الفواتير</h4>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>الأصناف</th><th>السعر</th><th>عدد القطع</th><th>الإجمالي</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
(function () {
  const btn = $("#viewer-search-btn"), inp = $("#viewer-search");
  if (btn) btn.addEventListener("click", doViewerSearch);
  if (inp) inp.addEventListener("keydown", (e) => { if (e.key === "Enter") doViewerSearch(); });
})();

/* ---------- طلبات الدخول (جهة المدير) ---------- */
function updateReqBadge(n) {
  const b = $("#req-badge");
  if (!b) return;
  b.textContent = n;
  b.classList.toggle("hidden", !n);
}
async function refreshRequests() {
  if (!currentUser || currentUser.role !== "manager") return;
  try { pendingRequests = await Store.listPendingLoginRequests(); } catch (e) { return; }
  updateReqBadge(pendingRequests.length);
  const tab = document.querySelector('.tab[data-tab="requests"]');
  if (tab && tab.classList.contains("active")) renderRequestsTab();
}
function startRequestPolling() {
  stopRequestPolling();
  refreshRequests();
  reqPollTimer = setInterval(refreshRequests, 5000);
}
function stopRequestPolling() {
  if (reqPollTimer) { clearInterval(reqPollTimer); reqPollTimer = null; }
  updateReqBadge(0);
}
function renderRequestsTab() {
  const rows = pendingRequests.length ? pendingRequests.map((r) => `
    <tr>
      <td>${r.username || "—"}</td>
      <td>${r.device || "—"}</td>
      <td>${r.created_at ? fmtDateTime(r.created_at) : "—"}</td>
      <td class="row-actions">
        <button class="btn btn-success btn-sm" onclick="decideRequest(${r.id}, true)">موافقة</button>
        <button class="btn btn-danger btn-sm" onclick="decideRequest(${r.id}, false)">رفض</button>
      </td>
    </tr>`).join("") : '<tr><td colspan="4" class="empty-msg">لا توجد طلبات دخول معلّقة.</td></tr>';
  $("#tab-requests").innerHTML = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">طلبات معلّقة</div>
        <div class="stat-value">${pendingRequests.length.toLocaleString("ar-EG")}</div>
      </div>
    </div>
    <p class="info-line">طلبات دخول الموظفين بانتظار موافقتك. تُحدَّث تلقائياً.</p>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>المستخدم</th><th>الجهاز</th><th>وقت الطلب</th><th>القرار</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
async function decideRequest(id, approve) {
  try {
    await Store.decideLoginRequest(id, approve);
    toast(approve ? "تمت الموافقة على الدخول" : "تم رفض الدخول");
    await refreshRequests();
  } catch (e) { toast(errMsg(e, "تعذّر تنفيذ القرار"), true); }
}

/* =========================================================
   واجهة الموظف
   ========================================================= */
$("#employee-search-btn").addEventListener("click", doEmployeeSearch);
$("#employee-search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doEmployeeSearch();
});

function doEmployeeSearch() {
  const q = $("#employee-search").value.trim();
  const box = $("#employee-results");
  if (!q) {
    box.innerHTML = '<p class="empty-msg">الرجاء كتابة اسم العميل للبحث.</p>';
    return;
  }
  const matches = matchCustomers(q);
  if (matches.length === 0) {
    box.innerHTML = '<p class="empty-msg">لا يوجد عميل بهذا الاسم.</p>';
    return;
  }
  box.innerHTML = matches.map((c) => `
    <div class="result-card">
      <div class="result-name">${c.name}</div>
      <div class="result-actions">
        <button class="btn btn-primary" onclick="openBillForm(${c.id})">إضافة فاتورة</button>
        <button class="btn btn-success" onclick="openPaymentForm(${c.id})">إضافة دفعة</button>
        <button class="btn btn-warning" onclick="openReturnForm(${c.id})">إضافة مرتجع</button>
      </div>
    </div>
  `).join("");
}

/* ---------- تاريخ السجل عند تعديل المدير ---------- */
function recDateISO() {
  const el = $("#rec-date");
  if (el && el.value) return new Date(el.value + "T12:00:00Z").toISOString();
  return null;
}
function dateFieldHTML(editing, rec) {
  const canEditDate = editing && currentUser && currentUser.role === "manager";
  if (canEditDate) {
    return `<div class="field"><label>التاريخ (يمكن للمدير تعديله)</label><input type="date" id="rec-date" value="${cairoDayKey(rec.date)}" /></div>`;
  }
  const shown = editing ? fmtDateTime(rec.date) : fmtDateTime(new Date().toISOString());
  return `<p class="info-line">التاريخ: <b>${shown}</b>${editing ? "" : " (يُسجَّل تلقائياً بتوقيت مصر)"}</p>`;
}

/* ---------- نموذج فاتورة/مرتجع (بنود متطابقة) ---------- */
function openReturnForm(custId, editId) { openBillForm(custId, editId, "return"); }
function openBillForm(custId, editId, mode) {
  mode = mode || "bill";
  const isReturn = mode === "return";
  const cust = customerById(custId);
  const editing = editId != null;
  const rec = editing ? (isReturn ? DB.payments.find((p) => p.id === editId) : DB.bills.find((b) => b.id === editId)) : null;
  const word = isReturn ? "مرتجع" : "فاتورة";
  const items = editing ? (rec.items || []) : null;
  openModal((editing ? ("تعديل " + word + " — ") : (word + " جديد — ")) + cust.name, `
    ${dateFieldHTML(editing, rec)}
    <div class="field">
      <label>رقم ال${word} / الكشف (إلزامي)</label>
      <input type="text" id="bill-docno" placeholder="مثال: 42690" value="${editing ? (rec.docNo || "") : ""}" required />
    </div>
    <div class="table-wrap">
      <table class="bill-items">
        <thead>
          <tr>
            <th style="width:32%">وصف الصنف</th>
            <th style="width:14%">المقاس</th>
            <th style="width:13%">العدد</th>
            <th style="width:18%">السعر</th>
            <th style="width:19%">الإجمالي</th>
            <th style="width:4%"></th>
          </tr>
        </thead>
        <tbody id="bill-rows"></tbody>
      </table>
    </div>
    <button type="button" class="btn btn-outline btn-sm" onclick="addBillRow()">+ إضافة صف</button>
    <div class="bill-total-row">
      <span>المجموع الكلي</span>
      <span class="num" id="bill-grand-total">0 ج.م</span>
    </div>
    <div class="modal-actions">
      <button class="btn btn-success" onclick="saveBill(${custId}, ${editing ? editId : "null"}, '${mode}')">${editing ? "حفظ التعديلات" : ("حفظ ال" + word)}</button>
      <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    </div>
  `);
  if (editing) { items.forEach((it) => addBillRow(it)); }
  else { addBillRow(); addBillRow(); }
}

function addBillRow(item) {
  const tbody = $("#bill-rows");
  const tr = document.createElement("tr");
  const desc = item ? (item.description || "") : "";
  const size = item ? (item.size || "") : "";
  const count = item ? item.count : 1;
  const price = item ? item.price : 0;
  tr.innerHTML = `
    <td><input type="text" class="it-desc" placeholder="وصف الصنف" value="${String(desc).replace(/"/g, "&quot;")}" /></td>
    <td><input type="text" class="it-size" placeholder="المقاس" value="${String(size).replace(/"/g, "&quot;")}" /></td>
    <td><input type="number" class="it-count" min="0" value="${count}" oninput="recalcBill()" /></td>
    <td><input type="number" class="it-price" min="0" value="${price}" oninput="recalcBill()" /></td>
    <td class="line-total">0</td>
    <td><button type="button" class="row-del" onclick="this.closest('tr').remove(); recalcBill()">&times;</button></td>
  `;
  tbody.appendChild(tr);
  recalcBill();
}

function recalcBill() {
  let grand = 0;
  $$("#bill-rows tr").forEach((tr) => {
    const count = Number(tr.querySelector(".it-count").value) || 0;
    const price = Number(tr.querySelector(".it-price").value) || 0;
    const line = count * price;
    tr.querySelector(".line-total").textContent = line.toLocaleString("ar-EG");
    grand += line;
  });
  $("#bill-grand-total").textContent = fmtMoney(grand);
}

function saveBill(custId, editId, mode) {
  mode = mode || "bill";
  const isReturn = mode === "return";
  const word = isReturn ? "المرتجع" : "الفاتورة";
  const items = [];
  $$("#bill-rows tr").forEach((tr) => {
    const description = tr.querySelector(".it-desc").value.trim();
    const size = tr.querySelector(".it-size").value.trim();
    const count = Number(tr.querySelector(".it-count").value) || 0;
    const price = Number(tr.querySelector(".it-price").value) || 0;
    if (description && count > 0 && price >= 0) {
      items.push({ description, size, count, price });
    }
  });
  if (items.length === 0) {
    toast("الرجاء إدخال صنف واحد على الأقل مع وصف وعدد", true);
    return;
  }
  const total = items.reduce((s, it) => s + it.count * it.price, 0);
  const docNo = ($("#bill-docno") ? $("#bill-docno").value : "").trim();
  if (!docNo) {
    toast("رقم " + word + " إلزامي — لا يمكن الحفظ بدون رقم", true);
    return;
  }
  if (total <= 0) {
    toast("لا يمكن التسجيل بقيمة صفر أو بالسالب.", true);
    return;
  }
  const dateISO = recDateISO();
  const editing = editId != null;
  confirmDialog(
    editing ? ("تأكيد تعديل " + word) : ("تأكيد " + word),
    (editing ? ("هل تريد حفظ التعديلات على " + word + "؟") : ("هل تريد إضافة هذا " + (isReturn ? "المرتجع" : "الفاتورة") + "؟")) + " الإجمالي: " + fmtMoney(total),
    () => commitBill(custId, editing ? editId : null, items, total, docNo, mode, dateISO)
  );
}
async function commitBill(custId, editId, items, total, docNo, mode, dateISO) {
  mode = mode || "bill";
  const isReturn = mode === "return";
  const word = isReturn ? "المرتجع" : "الفاتورة";
  try {
    if (editId != null) {
      if (isReturn) await Store.updatePayment(editId, total, "", docNo, dateISO, items);
      else await Store.updateBill(editId, items, total, docNo, dateISO);
      closeModal(); toast("تم تعديل " + word + " بنجاح"); refreshSubpage();
      return;
    }
    const payload = { items, total, docNo };
    if (isReturn) payload.kind = "return";
    if (isMaker()) {
      try {
        const cust = customerById(custId);
        await Store.createPendingEntry(isReturn ? "return" : "bill", custId, cust ? cust.name : "", payload, currentUser.username);
        closeModal(); toast("تم إرسال " + word + " للمراجعة");
        return;
      } catch (er) { /* الجدول غير موجود → إضافة مباشرة */ }
    }
    if (isReturn) await Store.addPayment(custId, total, "", docNo, "return", items);
    else await Store.addBill(custId, items, total, docNo);
    closeModal(); toast("تم حفظ " + word + " بنجاح"); refreshSubpage();
  } catch (e) { toast(errMsg(e, "تعذّر حفظ " + word), true); }
}

/* ---------- نموذج دفعة/خصم (مبلغ) ---------- */
const AMOUNT_KINDS = { payment: { word: "دفعة", label: "المبلغ المدفوع" }, discount: { word: "خصم", label: "قيمة الخصم" } };
function openDiscountForm(custId, editId) { openPaymentForm(custId, editId, "discount"); }
function openPaymentForm(custId, editId, kind) {
  const cust = customerById(custId);
  const editing = editId != null;
  const pay = editing ? DB.payments.find((p) => p.id === editId) : null;
  let k = editing ? kindOf(pay) : (kind || "payment");
  if (!AMOUNT_KINDS[k]) k = "payment";
  const def = AMOUNT_KINDS[k];
  openModal((editing ? ("تعديل " + def.word + " — ") : (def.word + " جديد — ")) + cust.name, `
    ${dateFieldHTML(editing, pay)}
    <div class="field">
      <label>${def.label}</label>
      <input type="number" id="pay-amount" min="0" placeholder="0" value="${editing ? pay.amount : ""}" />
    </div>
    <div class="field">
      <label>رقم ال${def.word} (اختياري)</label>
      <input type="text" id="pay-docno" placeholder="مثال: 387" value="${editing ? (pay.docNo || "") : ""}" />
    </div>
    <div class="field">
      <label>ملاحظة</label>
      <textarea id="pay-note" placeholder="ملاحظة اختيارية...">${editing ? (pay.note || "") : ""}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-success" onclick="savePayment(${custId}, ${editing ? editId : "null"}, '${k}')">${editing ? "حفظ التعديلات" : ("حفظ ال" + def.word)}</button>
      <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    </div>
  `);
}

function savePayment(custId, editId, kind) {
  kind = AMOUNT_KINDS[kind] ? kind : "payment";
  const word = AMOUNT_KINDS[kind].word;
  const amount = Number($("#pay-amount").value) || 0;
  const note = $("#pay-note").value.trim();
  const docNo = ($("#pay-docno") ? $("#pay-docno").value : "").trim();
  if (amount <= 0) {
    toast("الرجاء إدخال مبلغ صحيح", true);
    return;
  }
  const dateISO = recDateISO();
  const editing = editId != null;
  confirmDialog(
    editing ? ("تأكيد تعديل ال" + word) : ("تأكيد ال" + word),
    (editing ? ("هل تريد حفظ التعديلات على ال" + word + "؟") : ("هل تريد إضافة هذا ال" + word + "؟")) + " المبلغ: " + fmtMoney(amount),
    () => commitPayment(custId, editing ? editId : null, amount, note, docNo, kind, dateISO)
  );
}
async function commitPayment(custId, editId, amount, note, docNo, kind, dateISO) {
  kind = AMOUNT_KINDS[kind] ? kind : "payment";
  const word = AMOUNT_KINDS[kind].word;
  try {
    if (editId != null) {
      await Store.updatePayment(editId, amount, note, docNo, dateISO);
      closeModal(); toast("تم تعديل ال" + word + " بنجاح"); refreshSubpage();
      return;
    }
    if (isMaker()) {
      try {
        const cust = customerById(custId);
        await Store.createPendingEntry("payment", custId, cust ? cust.name : "", { amount, note, docNo, kind }, currentUser.username);
        closeModal(); toast("تم إرسال ال" + word + " للمراجعة");
        return;
      } catch (er) { /* الجدول غير موجود → إضافة مباشرة */ }
    }
    await Store.addPayment(custId, amount, note, docNo, kind);
    closeModal(); toast("تم حفظ ال" + word + " بنجاح"); refreshSubpage();
  } catch (e) { toast(errMsg(e, "تعذّر حفظ ال" + word), true); }
}

/* =========================================================
   واجهة المدير
   ========================================================= */
$$("#manager-view .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$("#manager-view .tab").forEach((t) => t.classList.remove("active"));
    $$("#manager-view .tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $("#tab-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "requests") renderRequestsTab();
    if (tab.dataset.tab === "rejected") refreshManagerRejected();
  });
});

function renderManager() {
  renderClientsTab();
  renderDailyTab();
  renderMonthlyTab();
  renderStatementTab();
  renderAllBillsTab();
  renderCreditTab();
  renderRejectedTab();
  renderRequestsTab();
}

/* ---------- تبويب المرفوضات (المدير: حذف فقط) ---------- */
let managerRejected = [];
function renderRejectedTab() {
  const rows = managerRejected.length ? managerRejected.map((e) => `
    <tr class="clickable-row" onclick="showRejectedDetails(${e.id})">
      <td>${entryKindBadge(e.kind)}</td>
      <td>${e.customerName || "—"}</td>
      <td>${entryDetail(e)}</td>
      <td class="num">${fmtMoney(entryAmount(e))}</td>
      <td>${e.createdBy || "—"}</td>
      <td>${e.decided_at ? fmtDateTime(e.decided_at) : "—"}</td>
      <td class="row-actions"><button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); mgrDeleteRejected(${e.id})">حذف</button></td>
    </tr>`).join("") : '<tr><td colspan="7" class="empty-msg">لا توجد إدخالات مرفوضة.</td></tr>';
  $("#tab-rejected").innerHTML = `
    <div class="section-head">
      <p class="info-line" style="margin:0">الإدخالات التي رفضها المراجِع. حذفها من صلاحيتك وحدك.</p>
      ${managerRejected.length ? '<button class="btn btn-danger btn-sm" onclick="mgrDeleteAllRejected()">حذف الكل</button>' : ""}
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>النوع</th><th>العميل</th><th>التفاصيل</th><th>القيمة</th><th>المُدخِل</th><th>وقت الرفض</th><th>حذف</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
async function refreshManagerRejected() {
  if (!currentUser || currentUser.role !== "manager") return;
  try { managerRejected = await Store.listRejectedEntries(); } catch (e) { return; }
  renderRejectedTab();
}
function mgrDeleteRejected(id) {
  confirmDialog("حذف إدخال مرفوض", "هل تريد حذف هذا الإدخال المرفوض؟", async () => {
    try { await Store.deletePendingEntry(id); toast("تم الحذف"); await refreshManagerRejected(); }
    catch (e) { toast(errMsg(e, "تعذّر الحذف"), true); }
  }, { danger: true, yesLabel: "حذف" });
}
function mgrDeleteAllRejected() {
  if (!managerRejected.length) return;
  confirmDialog("حذف كل المرفوضات", "هل تريد حذف جميع الإدخالات المرفوضة؟ لا يمكن التراجع.", async () => {
    try { await Store.deleteRejectedEntries(); toast("تم حذف الكل"); await refreshManagerRejected(); }
    catch (e) { toast(errMsg(e, "تعذّر الحذف"), true); }
  }, { danger: true, yesLabel: "حذف الكل" });
}

/* ---------- تبويب جميع الفواتير (بحث برقم الفاتورة أو اسم الصنف) ---------- */
let allBillsQuery = "";
function allBillsMatch(b, q, nq) {
  if (b.docNo && String(b.docNo).includes(q)) return true;
  if (("#" + b.id).includes(q) || String(b.id).includes(q)) return true;
  return (b.items || []).some((it) => normSearch(it.description).includes(nq));
}
function allBillsRows() {
  const q = allBillsQuery.trim();
  if (!q) return '<tr><td colspan="6" class="empty-msg">اكتب رقم الفاتورة أو اسم الصنف للبحث.</td></tr>';
  const nq = normSearch(q);
  const matches = DB.bills.filter((b) => allBillsMatch(b, q, nq)).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!matches.length) return '<tr><td colspan="6" class="empty-msg">لا توجد فواتير مطابقة.</td></tr>';
  const shown = matches.slice(0, 300);
  let html = shown.map((b) => {
    const cust = customerById(b.customerId);
    return `
      <tr class="clickable-row" onclick="openClientProfile(${b.customerId})">
        <td class="num">${b.docNo ? b.docNo : ("#" + b.id)}</td>
        <td>${fmtDate(b.date)}</td>
        <td>${cust ? cust.name : "—"}</td>
        <td>${b.items.map((it) => `${it.description}${it.size ? " (" + it.size + ")" : ""} × ${it.count.toLocaleString("ar-EG")}`).join("<br>")}</td>
        <td class="num">${b.items.map((it) => fmtMoney(it.price)).join("<br>")}</td>
        <td class="num">${fmtMoney(b.total)}</td>
      </tr>`;
  }).join("");
  if (matches.length > shown.length) {
    html += `<tr><td colspan="6" class="empty-msg">عرض ${shown.length.toLocaleString("ar-EG")} من ${matches.length.toLocaleString("ar-EG")} نتيجة — حدِّد البحث أكثر.</td></tr>`;
  }
  return html;
}
function renderAllBillsTab() {
  const q = allBillsQuery.trim();
  const count = q ? DB.bills.filter((b) => allBillsMatch(b, q, normSearch(q))).length : 0;
  $("#tab-allbills").innerHTML = `
    <div class="search-bar">
      <input type="text" id="allbills-search" placeholder="ابحث برقم الفاتورة أو اسم الصنف..." value="${allBillsQuery.replace(/"/g, "&quot;")}" />
    </div>
    <p class="info-line">بحث في كل فواتير النظام (<b>${DB.bills.length.toLocaleString("ar-EG")}</b> فاتورة) حسب رقم الفاتورة أو اسم الصنف${q ? ` — <b>${count.toLocaleString("ar-EG")}</b> نتيجة` : ""}. اضغط على الفاتورة لفتح ملف العميل.</p>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الأصناف</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody id="allbills-body">${allBillsRows()}</tbody>
      </table>
    </div>`;
  const inp = $("#allbills-search");
  if (inp) inp.oninput = () => {
    allBillsQuery = inp.value;
    $("#allbills-body").innerHTML = allBillsRows();
  };
}

/* ---------- تبويب العملاء ---------- */
let clientsQuery = "";
function clientsRows() {
  let custs = DB.customers;
  if (clientsQuery.trim()) {
    const set = new Set(matchCustomers(clientsQuery).map((c) => c.id));
    custs = DB.customers.filter((c) => set.has(c.id));
  }
  if (!custs.length) return '<tr><td colspan="6" class="empty-msg">لا يوجد عميل مطابق للبحث.</td></tr>';
  return custs.map((c) => {
    const bal = balanceOf(c.id);
    const cls = bal > 0 ? "badge-danger" : "badge-success";
    const label = bal > 0 ? "مستحق" : "مسدد";
    return `
      <tr class="clickable-row" onclick="openClientProfile(${c.id})">
        <td>${c.name}</td>
        <td class="num">${fmtMoney(totalBills(c.id))}</td>
        <td class="num">${fmtMoney(totalPayments(c.id))}</td>
        <td class="num">${fmtMoney(bal)}</td>
        <td><span class="badge ${cls}">${label}</span></td>
        <td class="row-actions">
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); editCustomerForm(${c.id})">تعديل</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteCustomer(${c.id})">حذف</button>
        </td>
      </tr>`;
  }).join("");
}
function renderClientsTab() {
  // صافي المستحق: يطرح أرصدة العملاء الدائنة (المدفوع مقدماً) ليطابق كشف الإجمالي
  const totalOutstanding = DB.customers.reduce((s, c) => s + balanceOf(c.id), 0);

  $("#tab-clients").innerHTML = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">عدد العملاء</div>
        <div class="stat-value">${DB.customers.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">إجمالي المبيعات</div>
        <div class="stat-value">${fmtMoney(DB.bills.reduce((s, b) => s + b.total, 0))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">إجمالي الدفعات</div>
        <div class="stat-value">${fmtMoney(DB.payments.reduce((s, p) => s + p.amount, 0))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">إجمالي المبالغ المستحقة</div>
        <div class="stat-value pos">${fmtMoney(totalOutstanding)}</div>
      </div>
    </div>
    <div class="section-head">
      <p class="info-line" style="margin:0">اضغط على أي عميل لعرض ملفه الكامل.</p>
      <button class="btn btn-primary btn-sm" onclick="addCustomerForm()">+ إضافة عميل</button>
    </div>
    <div class="search-bar">
      <input type="text" id="clients-search" placeholder="ابحث باسم العميل..." value="${clientsQuery.replace(/"/g, "&quot;")}" />
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>اسم العميل</th>
            <th>إجمالي الفواتير</th>
            <th>إجمالي الدفعات</th>
            <th>الرصيد المستحق</th>
            <th>الحالة</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody id="clients-body">${clientsRows()}</tbody>
      </table>
    </div>`;
  const inp = $("#clients-search");
  if (inp) inp.oninput = () => { clientsQuery = inp.value; $("#clients-body").innerHTML = clientsRows(); };
}

/* ---------- تبويب المبيعات اليومية ---------- */
let dailyFrom = "", dailyTo = "";
function clearDailyFilter() { dailyFrom = ""; dailyTo = ""; renderDailyTab(); }
function renderDailyTab() {
  let bills = DB.bills;
  if (dailyFrom) bills = bills.filter((b) => cairoDayKey(b.date) >= dailyFrom);
  if (dailyTo) bills = bills.filter((b) => cairoDayKey(b.date) <= dailyTo);
  const map = {};
  bills.forEach((b) => {
    const key = cairoDayKey(b.date);
    if (!map[key]) map[key] = { total: 0, count: 0 };
    map[key].total += b.total;
    map[key].count += 1;
  });
  const keys = Object.keys(map).sort().reverse();
  const grand = keys.reduce((s, k) => s + map[k].total, 0);
  const rows = keys.length ? keys.map((k) => `
    <tr class="clickable-row" onclick="openDayBills('${k}')">
      <td>${fmtDate(k + "T12:00:00Z")}</td>
      <td class="num">${map[k].count}</td>
      <td class="num">${fmtMoney(map[k].total)}</td>
      <td class="nav-cell">عرض ›</td>
    </tr>`).join("") : '<tr><td colspan="4" class="empty-msg">لا توجد مبيعات في هذه الفترة.</td></tr>';

  $("#tab-daily").innerHTML = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">عدد الأيام</div>
        <div class="stat-value">${keys.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">إجمالي المبيعات</div>
        <div class="stat-value">${fmtMoney(grand)}</div>
      </div>
    </div>
    <div class="filter-bar">
      <label>من تاريخ <input type="date" id="daily-from" value="${dailyFrom}" /></label>
      <label>إلى تاريخ <input type="date" id="daily-to" value="${dailyTo}" /></label>
      <button class="btn btn-outline btn-sm" onclick="clearDailyFilter()">مسح الفلتر</button>
    </div>
    <p class="info-line">اضغط على أي يوم لعرض كل فواتيره.</p>
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr><th>اليوم</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  const f = $("#daily-from"), t = $("#daily-to");
  if (f) f.onchange = () => { dailyFrom = f.value; renderDailyTab(); };
  if (t) t.onchange = () => { dailyTo = t.value; renderDailyTab(); };
}

/* ---------- تبويب المبيعات الشهرية ---------- */
function renderMonthlyTab() {
  const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const map = {};
  DB.bills.forEach((b) => {
    const key = cairoMonthKey(b.date);
    const parts = key.split("-");
    if (!map[key]) map[key] = { total: 0, count: 0, label: monthNames[parseInt(parts[1], 10) - 1] + " " + parts[0] };
    map[key].total += b.total;
    map[key].count += 1;
  });
  const keys = Object.keys(map).sort().reverse();
  if (keys.length === 0) {
    $("#tab-monthly").innerHTML = '<p class="empty-msg">لا توجد مبيعات مسجلة.</p>';
    return;
  }
  const rows = keys.map((k) => `
    <tr class="clickable-row" onclick="openMonthBills('${k}')">
      <td>${map[k].label}</td>
      <td class="num">${map[k].count}</td>
      <td class="num">${fmtMoney(map[k].total)}</td>
      <td class="nav-cell">عرض ›</td>
    </tr>`).join("");
  const grand = keys.reduce((s, k) => s + map[k].total, 0);

  $("#tab-monthly").innerHTML = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">عدد الأشهر</div>
        <div class="stat-value">${keys.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">إجمالي المبيعات</div>
        <div class="stat-value">${fmtMoney(grand)}</div>
      </div>
    </div>
    <p class="info-line">اضغط على أي شهر لعرض كل فواتيره.</p>
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr><th>الشهر</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ---------- تبويب كشف الحسابات ---------- */
let statementQuery = "";
let statementSort = { key: "", dir: -1 }; // dir: -1 تنازلي، 1 تصاعدي
function stmtVal(c, key) {
  switch (key) {
    case "nbills": return billsOf(c.id).length;
    case "tbills": return totalBills(c.id);
    case "npays": return paymentsOf(c.id).length;
    case "tpays": return totalPayments(c.id);
    case "bal": return balanceOf(c.id);
    default: return c.name;
  }
}
function sortStatement(key) {
  if (statementSort.key === key) statementSort.dir = -statementSort.dir;
  else { statementSort.key = key; statementSort.dir = -1; }
  renderStatementTab();
}
function stmtArrow(key) {
  if (statementSort.key !== key) return "";
  return statementSort.dir < 0 ? " ▼" : " ▲";
}
function statementRows() {
  let custs = DB.customers;
  if (statementQuery.trim()) {
    const set = new Set(matchCustomers(statementQuery).map((c) => c.id));
    custs = DB.customers.filter((c) => set.has(c.id));
  }
  if (statementSort.key) {
    const k = statementSort.key, dir = statementSort.dir;
    custs = custs.slice().sort((a, b) => {
      const va = stmtVal(a, k), vb = stmtVal(b, k);
      if (typeof va === "string") return va.localeCompare(vb, "ar") * dir;
      return (va - vb) * dir;
    });
  }
  if (!custs.length) return '<tr><td colspan="6" class="empty-msg">لا يوجد عميل مطابق للبحث.</td></tr>';
  return custs.map((c) => {
    const bal = balanceOf(c.id);
    return `
      <tr class="clickable-row" onclick="openClientProfile(${c.id})">
        <td>${c.name}</td>
        <td class="num">${billsOf(c.id).length}</td>
        <td class="num">${fmtMoney(totalBills(c.id))}</td>
        <td class="num">${paymentsOf(c.id).length}</td>
        <td class="num">${fmtMoney(totalPayments(c.id))}</td>
        <td class="num">${fmtMoney(bal)}</td>
      </tr>`;
  }).join("");
}
function renderStatementTab() {
  $("#tab-statement").innerHTML = `
    <div class="search-bar">
      <input type="text" id="statement-search" placeholder="ابحث باسم العميل..." value="${statementQuery.replace(/"/g, "&quot;")}" />
    </div>
    <p class="info-line">كشف حساب مختصر لكل عميل — اضغط على العميل لعرض التفاصيل، أو على عنوان العمود للترتيب.</p>
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>العميل</th>
            <th class="sortable" onclick="sortStatement('nbills')">عدد الفواتير${stmtArrow("nbills")}</th>
            <th class="sortable" onclick="sortStatement('tbills')">إجمالي الفواتير${stmtArrow("tbills")}</th>
            <th class="sortable" onclick="sortStatement('npays')">عدد الدفعات${stmtArrow("npays")}</th>
            <th class="sortable" onclick="sortStatement('tpays')">إجمالي الدفعات${stmtArrow("tpays")}</th>
            <th class="sortable" onclick="sortStatement('bal')">الرصيد المستحق${stmtArrow("bal")}</th>
          </tr>
        </thead>
        <tbody id="statement-body">${statementRows()}</tbody>
      </table>
    </div>`;
  const inp = $("#statement-search");
  if (inp) inp.oninput = () => { statementQuery = inp.value; $("#statement-body").innerHTML = statementRows(); };
}

/* ---------- تبويب الأرصدة الدائنة (العملاء الذين دفعوا أكثر من مستحقاتهم) ---------- */
function renderCreditTab() {
  const credit = DB.customers
    .map((c) => ({ c, bal: balanceOf(c.id) }))
    .filter((x) => x.bal < -0.005)
    .sort((a, b) => a.bal - b.bal); // الأكبر رصيداً دائناً أولاً
  const total = credit.reduce((s, x) => s + x.bal, 0);
  const rows = credit.length
    ? credit.map(({ c, bal }) => `
      <tr class="clickable-row" onclick="openClientProfile(${c.id})">
        <td>${c.name}</td>
        <td class="num">${fmtMoney(totalBills(c.id))}</td>
        <td class="num">${fmtMoney(totalPayments(c.id))}</td>
        <td class="num"><b>${fmtMoney(-bal)}</b></td>
      </tr>`).join("")
    : '<tr><td colspan="4" class="empty-msg">لا يوجد عملاء لديهم رصيد دائن.</td></tr>';
  $("#tab-credit").innerHTML = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">عدد العملاء الدائنين</div>
        <div class="stat-value">${credit.length.toLocaleString("ar-EG")}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">إجمالي الأرصدة الدائنة (لهم عندك)</div>
        <div class="stat-value">${fmtMoney(-total)}</div>
      </div>
    </div>
    <p class="info-line">هؤلاء العملاء دفعوا أكثر من قيمة فواتيرهم، فالرصيد لهم عندك (دفعة مقدمة/عربون). اضغط على العميل لعرض ملفه الكامل.</p>
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>اسم العميل</th>
            <th>إجمالي الفواتير</th>
            <th>إجمالي المدفوع</th>
            <th>الرصيد الدائن (له عندك)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ---------- ملف العميل الكامل ---------- */
/* حساب إحصاءات موسّعة للعميل */
function clientStats(id) {
  const bills = billsOf(id);
  const payments = paymentsOf(id);
  const tBills = totalBills(id);
  const tPays = totalPayments(id);
  const itemsSold = bills.reduce((s, b) => s + b.items.reduce((x, it) => x + it.count, 0), 0);
  const distinctItems = new Set();
  bills.forEach((b) => b.items.forEach((it) => distinctItems.add(it.description)));
  const allDates = [...bills, ...payments].map((r) => new Date(r.date));
  const tCash = sumKind(id, "payment");
  const tTransfer = sumKind(id, "transfer");
  const tDiscount = sumKind(id, "discount");
  const tReturn = sumKind(id, "return");
  const numCash = payments.filter((p) => kindOf(p) === "payment").length;
  return {
    bills, payments,
    tBills, tPays,
    tCash, tTransfer, tDiscount, tReturn, numCash,
    balance: tBills - tPays,
    numBills: bills.length,
    numPayments: payments.length,
    itemsSold,
    distinctItems: distinctItems.size,
    avgBill: bills.length ? tBills / bills.length : 0,
    maxBill: bills.reduce((m, b) => Math.max(m, b.total), 0),
    maxPayment: payments.reduce((m, p) => Math.max(m, p.amount), 0),
    payRatio: tBills ? Math.round((tPays / tBills) * 100) : 0,
    firstDate: allDates.length ? new Date(Math.min(...allDates)) : null,
    lastDate: allDates.length ? new Date(Math.max(...allDates)) : null
  };
}

/* الانتقال إلى صفحة العميل (بدل النافذة المنبثقة) */
function renderProfileInto(custId) {
  profileCustId = custId;
  currentSub = null;
  $("#client-content").innerHTML = renderClientProfile(custId);
}
function openClientProfile(custId) {
  const active = document.querySelector(".tab.active");
  if (active) lastManagerTab = active.dataset.tab;
  renderProfileInto(custId);
  showOnlyView("client-view");
  window.scrollTo(0, 0);
}
function backToProfile() {
  renderProfileInto(profileCustId);
  showOnlyView("client-view");
  window.scrollTo(0, 0);
}
function backToManager() {
  showOnlyView("manager-view");
  renderManager();
  const tab = document.querySelector(`.tab[data-tab="${lastManagerTab}"]`);
  if (tab) tab.click();
  window.scrollTo(0, 0);
}

/* ---------- الصفحات الفرعية للعميل ---------- */
function openSubpage(custId, type) {
  currentSub = { custId, type };
  $("#subpage-content").innerHTML = subpageHTML(custId, type);
  showOnlyView("subpage-view");
  window.scrollTo(0, 0);
}
/* إعادة رسم الصفحة الفرعية الحالية بعد تعديل/حذف (بدون تمرير) */
function refreshSubpage() {
  if (!currentSub) return;
  $("#subpage-content").innerHTML = subpageHTML(currentSub.custId, currentSub.type);
}
function subpageHTML(custId, type) {
  if (type === "bills") return renderBillsPage(custId);
  if (type === "payments") return renderPaymentsPage(custId);
  if (type === "statement") return renderStatementPage(custId);
  if (type === "analytics") return renderAnalyticsPage(custId);
  return "";
}

function subpageHeader(custId, title) {
  const c = customerById(custId);
  return `<h2 class="page-title subpage-title">${title} — <span class="subpage-client">${c.name}</span></h2>`;
}

/* --- صفحة الفواتير (مع تعديل/حذف) --- */
function renderBillsPage(custId) {
  const bills = billsOf(custId).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const rows = bills.length ? bills.map((b) => `
    <tr>
      <td>#${b.id}</td>
      <td class="num">${docCell(b.docNo)}</td>
      <td>${fmtDateTime(b.date)}</td>
      <td>${b.items.map((it) => `${it.description}${it.size ? " (" + it.size + ")" : ""} × ${it.count.toLocaleString("ar-EG")}`).join("<br>")}</td>
      <td class="num">${b.items.map((it) => fmtMoney(it.price)).join("<br>")}</td>
      <td class="num">${b.items.reduce((x, it) => x + it.count, 0).toLocaleString("ar-EG")}</td>
      <td class="num">${fmtMoney(b.total)}</td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" onclick="openBillForm(${custId}, ${b.id})">تعديل</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBill(${b.id})">حذف</button>
      </td>
    </tr>`).join("") :
    '<tr><td colspan="8" class="empty-msg">لا توجد فواتير.</td></tr>';
  return `
    ${subpageHeader(custId, "الفواتير")}
    <div class="section-head">
      <p class="info-line" style="margin:0">إجمالي الفواتير: <b>${fmtMoney(totalBills(custId))}</b> — العدد: <b>${bills.length.toLocaleString("ar-EG")}</b></p>
      <button class="btn btn-primary btn-sm" onclick="openBillForm(${custId})">+ إضافة فاتورة</button>
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>رقم</th><th>رقم الكشف</th><th>التاريخ</th><th>الأصناف</th><th>السعر</th><th>عدد القطع</th><th>الإجمالي</th><th>إجراءات</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* --- صفحة الدفعات (مع تعديل/حذف) --- */
function renderPaymentsPage(custId) {
  const payments = paymentsOf(custId).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const rows = payments.length ? payments.map((p) => {
    const isRet = kindOf(p) === "return";
    const editCall = isRet ? `openReturnForm(${custId}, ${p.id})` : `openPaymentForm(${custId}, ${p.id})`;
    const desc = (isRet && p.items && p.items.length)
      ? p.items.map((it) => `${it.description}${it.size ? " (" + it.size + ")" : ""} × ${it.count.toLocaleString("ar-EG")}`).join("<br>")
      : (p.note || "—");
    return `
    <tr>
      <td>#${p.id}</td>
      <td class="num">${docCell(p.docNo)}</td>
      <td>${fmtDateTime(p.date)}</td>
      <td>${kindBadge(kindOf(p))}</td>
      <td class="num">${fmtMoney(p.amount)}</td>
      <td>${desc}</td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" onclick="${editCall}">تعديل</button>
        <button class="btn btn-danger btn-sm" onclick="deletePayment(${p.id})">حذف</button>
      </td>
    </tr>`;
  }).join("") :
    '<tr><td colspan="7" class="empty-msg">لا توجد حركات.</td></tr>';
  return `
    ${subpageHeader(custId, "الدفعات والحركات")}
    <div class="section-head">
      <p class="info-line" style="margin:0">إجمالي الحركات الدائنة: <b>${fmtMoney(totalPayments(custId))}</b> — العدد: <b>${payments.length.toLocaleString("ar-EG")}</b></p>
      <div class="btn-group">
        <button class="btn btn-success btn-sm" onclick="openPaymentForm(${custId})">+ إضافة دفعة</button>
        <button class="btn btn-outline btn-sm" onclick="openDiscountForm(${custId})">+ إضافة خصم</button>
        <button class="btn btn-warning btn-sm" onclick="openReturnForm(${custId})">+ إضافة مرتجع</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>رقم</th><th>رقم الدفعة</th><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th><th>إجراءات</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* --- صفحة كشف الحساب (رصيد جارٍ) --- */
function renderStatementPage(custId) {
  const bills = billsOf(custId);
  const payments = paymentsOf(custId);
  const entries = [
    ...bills.map((b) => ({ date: b.date, type: "bill", docNo: b.docNo || "", desc: b.items.map((it) => it.description).join("، ") || "فاتورة", debit: b.total, credit: 0 })),
    ...payments.map((p) => ({ date: p.date, type: "payment", kind: kindOf(p), docNo: p.docNo || "", desc: p.note || kindLabel(kindOf(p)), debit: 0, credit: p.amount }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0;
  const rows = entries.length ? entries.map((e) => {
    running += e.debit - e.credit;
    const typeBadge = e.type === "bill"
      ? '<span class="badge badge-danger">فاتورة</span>'
      : kindBadge(e.kind);
    return `
      <tr>
        <td>${fmtDate(e.date)}</td>
        <td class="num">${docCell(e.docNo)}</td>
        <td>${typeBadge}</td>
        <td>${e.desc}</td>
        <td class="num">${e.debit ? fmtMoney(e.debit) : "—"}</td>
        <td class="num">${e.credit ? fmtMoney(e.credit) : "—"}</td>
        <td class="num">${fmtMoney(running)}</td>
      </tr>`;
  }).join("") : '<tr><td colspan="7" class="empty-msg">لا توجد حركات.</td></tr>';
  const bal = balanceOf(custId);
  return `
    ${subpageHeader(custId, "كشف الحساب")}
    <p class="info-line">الرصيد المستحق الحالي: <b>${fmtMoney(bal)}</b></p>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>التاريخ</th><th>رقم</th><th>النوع</th><th>البيان</th><th>مدين (فاتورة)</th><th>دائن</th><th>الرصيد الجاري</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* --- صفحة التحليلات (أبرز الأصناف + النشاط الشهري) --- */
function renderAnalyticsPage(custId) {
  const bills = billsOf(custId);
  const payments = paymentsOf(custId);
  const itemMap = {};
  bills.forEach((b) => b.items.forEach((it) => {
    if (!itemMap[it.description]) itemMap[it.description] = { count: 0, value: 0 };
    itemMap[it.description].count += it.count;
    itemMap[it.description].value += it.count * it.price;
  }));
  const items = Object.keys(itemMap).map((k) => ({ name: k, ...itemMap[k] })).sort((a, b) => b.value - a.value);
  const itemsHtml = items.length ? items.map((it) => `
    <tr><td>${it.name}</td><td class="num">${it.count.toLocaleString("ar-EG")}</td><td class="num">${fmtMoney(it.value)}</td></tr>`).join("") :
    '<tr><td colspan="3" class="empty-msg">لا توجد أصناف.</td></tr>';

  const mMap = {};
  bills.forEach((b) => {
    const d = new Date(b.date);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    (mMap[key] = mMap[key] || { bills: 0, count: 0, pays: 0, label: MONTH_NAMES[d.getMonth()] + " " + d.getFullYear() }).bills += b.total;
    mMap[key].count += 1;
  });
  payments.forEach((p) => {
    const d = new Date(p.date);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    (mMap[key] = mMap[key] || { bills: 0, count: 0, pays: 0, label: MONTH_NAMES[d.getMonth()] + " " + d.getFullYear() }).pays += p.amount;
  });
  const mKeys = Object.keys(mMap).sort().reverse();
  const monthlyHtml = mKeys.length ? mKeys.map((k) => `
    <tr><td>${mMap[k].label}</td><td class="num">${mMap[k].count.toLocaleString("ar-EG")}</td><td class="num">${fmtMoney(mMap[k].bills)}</td><td class="num">${fmtMoney(mMap[k].pays)}</td></tr>`).join("") :
    '<tr><td colspan="4" class="empty-msg">لا يوجد نشاط.</td></tr>';

  return `
    ${subpageHeader(custId, "التحليلات")}
    <div class="profile-section">
      <h4>أبرز الأصناف</h4>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>الصنف</th><th>إجمالي الكمية</th><th>إجمالي القيمة</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </div>
    </div>
    <div class="profile-section">
      <h4>النشاط الشهري</h4>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>الشهر</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th><th>إجمالي الدفعات</th></tr></thead>
          <tbody>${monthlyHtml}</tbody>
        </table>
      </div>
    </div>`;
}

/* بناء محتوى صفحة العميل الكاملة */
function renderClientProfile(custId) {
  const c = customerById(custId);
  const s = clientStats(custId);
  const balCls = s.balance > 0 ? "pos" : "zero";
  const statusBadge = s.balance > 0
    ? '<span class="badge badge-danger">مستحق عليه</span>'
    : '<span class="badge badge-success">مسدَّد بالكامل</span>';

  const statCard = (label, value, cls) =>
    `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${cls || ""}">${value}</div></div>`;

  const navCard = (type, icon, title, sub) => `
    <button class="nav-card" onclick="openSubpage(${custId}, '${type}')">
      <span class="nav-card-icon">${icon}</span>
      <span class="nav-card-body">
        <span class="nav-card-title">${title}</span>
        <span class="nav-card-sub">${sub}</span>
      </span>
      <span class="nav-card-arrow">‹</span>
    </button>`;

  return `
    <div class="profile-header">
      <div class="profile-avatar">${c.name.trim().charAt(0)}</div>
      <div>
        <h2 class="profile-name">${c.name}</h2>
        <div class="profile-meta">رقم العميل: ${c.id.toLocaleString("ar-EG")} &nbsp;•&nbsp; ${statusBadge}</div>
      </div>
    </div>

    <div class="stats-row">
      ${statCard("إجمالي الفواتير", fmtMoney(s.tBills))}
      ${statCard("إجمالي المدفوعات النقدية", fmtMoney(s.tCash))}
      ${statCard("الرصيد المستحق", fmtMoney(s.balance), balCls)}
      ${statCard("نسبة السداد", s.payRatio.toLocaleString("ar-EG") + "٪")}
    </div>

    <div class="stats-grid">
      ${statCard("عدد الفواتير", s.numBills.toLocaleString("ar-EG"))}
      ${statCard("عدد المدفوعات النقدية", s.numCash.toLocaleString("ar-EG"))}
      ${s.tTransfer ? statCard("إجمالي الترحيل", fmtMoney(s.tTransfer)) : ""}
      ${s.tDiscount ? statCard("إجمالي الخصومات", fmtMoney(s.tDiscount)) : ""}
      ${s.tReturn ? statCard("إجمالي المرتجعات", fmtMoney(s.tReturn)) : ""}
      ${statCard("إجمالي الأصناف المباعة", s.itemsSold.toLocaleString("ar-EG"))}
      ${statCard("أنواع الأصناف", s.distinctItems.toLocaleString("ar-EG"))}
      ${statCard("متوسط قيمة الفاتورة", fmtMoney(Math.round(s.avgBill)))}
      ${statCard("أعلى فاتورة", fmtMoney(s.maxBill))}
      ${statCard("أعلى دفعة", fmtMoney(s.maxPayment))}
      ${statCard("أول تعامل", s.firstDate ? fmtDate(s.firstDate.toISOString()) : "—")}
      ${statCard("آخر نشاط", s.lastDate ? fmtDate(s.lastDate.toISOString()) : "—")}
    </div>

    <h4 class="nav-cards-title">سجلات العميل</h4>
    <div class="nav-cards">
      ${navCard("bills", "🧾", "الفواتير", "عرض وتعديل وحذف — " + s.numBills.toLocaleString("ar-EG") + " فاتورة")}
      ${navCard("payments", "💵", "الدفعات والحركات", "دفعات وترحيل وخصم ومرتجع — " + s.numPayments.toLocaleString("ar-EG") + " حركة")}
      ${navCard("statement", "📊", "كشف الحساب", "الحركة الكاملة والرصيد الجاري")}
      ${navCard("analytics", "📈", "التحليلات", "أبرز الأصناف والنشاط الشهري")}
    </div>
  `;
}

/* =========================================================
   النافذة المنبثقة
   ========================================================= */
function openModal(title, bodyHtml) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = bodyHtml;
  $("#modal-overlay").classList.remove("hidden");
}
function closeModal() {
  $("#modal-overlay").classList.add("hidden");
  $("#modal-body").innerHTML = "";
  if (currentUser && currentUser.role === "manager") renderManager();
}
/* لا تُغلق النوافذ بالضغط على الخلفية — فقط زر «إلغاء» يغلقها */
$("#confirm-cancel").addEventListener("click", hideConfirm);

/* أزرار العودة */
$("#client-back").addEventListener("click", backToManager);
$("#subpage-back").addEventListener("click", backToProfile);
