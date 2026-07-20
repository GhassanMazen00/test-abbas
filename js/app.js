/* =========================================================
   منطق التطبيق — واجهة أمامية بالكامل
   ========================================================= */

/* في وضع الخادم تبدأ الذاكرة فارغة وتُملأ بعد تسجيل الدخول؛ محلياً تُحمّل من المتصفح */
let DB = (Store.mode === "supabase")
  ? { customers: [], bills: [], payments: [], seq: { bill: 0, payment: 0 } }
  : initDB();
let currentUser = null;

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
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }) +
    " - " + d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}
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

/* إظهار واجهة واحدة فقط من واجهات التطبيق */
function showOnlyView(viewId) {
  ["employee-view", "manager-view", "client-view", "subpage-view"].forEach((v) => {
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
    currentUser = { username: sess.username, role: sess.role };
    await Store.loadAll();
    $("#login-form").reset();
    startApp();
  } catch (err) {
    $("#login-error").textContent = (err && err.message) ? err.message : "تعذّر تسجيل الدخول";
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
});

$("#logout-btn").addEventListener("click", async () => {
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
    if (sess) {
      currentUser = { username: sess.username, role: sess.role };
      await Store.loadAll();
      startApp();
    }
  } catch (e) { /* تجاهل */ }
})();

function startApp() {
  $("#login-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#current-user").textContent =
    (currentUser.role === "manager" ? "المدير" : "الموظف") + ": " + currentUser.username;

  if (currentUser.role === "manager") {
    showOnlyView("manager-view");
    renderManager();
  } else {
    showOnlyView("employee-view");
    $("#employee-search").value = "";
    $("#employee-results").innerHTML =
      '<p class="empty-msg">اكتب اسم العميل في الأعلى ثم اضغط بحث.</p>';
  }
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
  const matches = DB.customers.filter((c) => c.name.includes(q));
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
      </div>
    </div>
  `).join("");
}

/* ---------- نموذج فاتورة (إضافة/تعديل) ---------- */
function openBillForm(custId, editId) {
  const cust = customerById(custId);
  const editing = editId != null;
  const bill = editing ? DB.bills.find((b) => b.id === editId) : null;
  const dateLine = editing
    ? `التاريخ: <b>${fmtDateTime(bill.date)}</b>`
    : `التاريخ: <b>${fmtDateTime(new Date().toISOString())}</b> (يُسجَّل تلقائياً)`;
  openModal((editing ? "تعديل فاتورة — " : "فاتورة جديدة — ") + cust.name, `
    <p class="info-line">${dateLine}</p>
    <div class="field">
      <label>رقم الكشف (اختياري)</label>
      <input type="text" id="bill-docno" placeholder="مثال: 42690" value="${editing ? (bill.docNo || "") : ""}" />
    </div>
    <div class="table-wrap">
      <table class="bill-items">
        <thead>
          <tr>
            <th style="width:42%">وصف الصنف</th>
            <th style="width:16%">العدد</th>
            <th style="width:20%">السعر</th>
            <th style="width:18%">الإجمالي</th>
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
      <button class="btn btn-success" onclick="saveBill(${custId}, ${editing ? editId : "null"})">${editing ? "حفظ التعديلات" : "حفظ الفاتورة"}</button>
      <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    </div>
  `);
  if (editing) {
    bill.items.forEach((it) => addBillRow(it));
  } else {
    addBillRow();
    addBillRow();
  }
}

function addBillRow(item) {
  const tbody = $("#bill-rows");
  const tr = document.createElement("tr");
  const desc = item ? item.description : "";
  const count = item ? item.count : 1;
  const price = item ? item.price : 0;
  tr.innerHTML = `
    <td><input type="text" class="it-desc" placeholder="وصف الصنف" value="${desc.replace(/"/g, "&quot;")}" /></td>
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

function saveBill(custId, editId) {
  const items = [];
  $$("#bill-rows tr").forEach((tr) => {
    const description = tr.querySelector(".it-desc").value.trim();
    const count = Number(tr.querySelector(".it-count").value) || 0;
    const price = Number(tr.querySelector(".it-price").value) || 0;
    if (description && count > 0 && price >= 0) {
      items.push({ description, count, price });
    }
  });
  if (items.length === 0) {
    toast("الرجاء إدخال صنف واحد على الأقل مع وصف وعدد", true);
    return;
  }
  const total = items.reduce((s, it) => s + it.count * it.price, 0);
  const docNo = ($("#bill-docno") ? $("#bill-docno").value : "").trim();
  const editing = editId != null;
  confirmDialog(
    editing ? "تأكيد تعديل الفاتورة" : "تأكيد الفاتورة",
    (editing ? "هل تريد حفظ التعديلات على الفاتورة؟" : "هل تريد إضافة هذه الفاتورة؟") + " الإجمالي: " + fmtMoney(total),
    () => commitBill(custId, editing ? editId : null, items, total, docNo)
  );
}
async function commitBill(custId, editId, items, total, docNo) {
  try {
    if (editId != null) {
      await Store.updateBill(editId, items, total, docNo);
      closeModal(); toast("تم تعديل الفاتورة بنجاح"); refreshSubpage();
    } else {
      await Store.addBill(custId, items, total, docNo);
      closeModal(); toast("تم حفظ الفاتورة بنجاح"); refreshSubpage();
    }
  } catch (e) { toast(errMsg(e, "تعذّر حفظ الفاتورة"), true); }
}

/* ---------- نموذج دفعة (إضافة/تعديل) ---------- */
function openPaymentForm(custId, editId) {
  const cust = customerById(custId);
  const editing = editId != null;
  const pay = editing ? DB.payments.find((p) => p.id === editId) : null;
  const dateLine = editing
    ? `التاريخ: <b>${fmtDateTime(pay.date)}</b>`
    : `التاريخ: <b>${fmtDateTime(new Date().toISOString())}</b> (يُسجَّل تلقائياً)`;
  openModal((editing ? "تعديل دفعة — " : "دفعة جديدة — ") + cust.name, `
    <p class="info-line">${dateLine}</p>
    <div class="field">
      <label>المبلغ المدفوع</label>
      <input type="number" id="pay-amount" min="0" placeholder="0" value="${editing ? pay.amount : ""}" />
    </div>
    <div class="field">
      <label>رقم الدفعة (اختياري)</label>
      <input type="text" id="pay-docno" placeholder="مثال: 387" value="${editing ? (pay.docNo || "") : ""}" />
    </div>
    <div class="field">
      <label>ملاحظة</label>
      <textarea id="pay-note" placeholder="ملاحظة اختيارية...">${editing ? (pay.note || "") : ""}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-success" onclick="savePayment(${custId}, ${editing ? editId : "null"})">${editing ? "حفظ التعديلات" : "حفظ الدفعة"}</button>
      <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    </div>
  `);
}

function savePayment(custId, editId) {
  const amount = Number($("#pay-amount").value) || 0;
  const note = $("#pay-note").value.trim();
  const docNo = ($("#pay-docno") ? $("#pay-docno").value : "").trim();
  if (amount <= 0) {
    toast("الرجاء إدخال مبلغ صحيح", true);
    return;
  }
  const editing = editId != null;
  confirmDialog(
    editing ? "تأكيد تعديل الدفعة" : "تأكيد الدفعة",
    (editing ? "هل تريد حفظ التعديلات على الدفعة؟" : "هل تريد إضافة هذه الدفعة؟") + " المبلغ: " + fmtMoney(amount),
    () => commitPayment(custId, editing ? editId : null, amount, note, docNo)
  );
}
async function commitPayment(custId, editId, amount, note, docNo) {
  try {
    if (editId != null) {
      await Store.updatePayment(editId, amount, note, docNo);
      closeModal(); toast("تم تعديل الدفعة بنجاح"); refreshSubpage();
    } else {
      await Store.addPayment(custId, amount, note, docNo, "payment");
      closeModal(); toast("تم حفظ الدفعة بنجاح"); refreshSubpage();
    }
  } catch (e) { toast(errMsg(e, "تعذّر حفظ الدفعة"), true); }
}

/* =========================================================
   واجهة المدير
   ========================================================= */
$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((t) => t.classList.remove("active"));
    $$(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $("#tab-" + tab.dataset.tab).classList.add("active");
  });
});

function renderManager() {
  renderClientsTab();
  renderDailyTab();
  renderMonthlyTab();
  renderStatementTab();
  renderCreditTab();
}

/* ---------- تبويب العملاء ---------- */
function renderClientsTab() {
  // صافي المستحق: يطرح أرصدة العملاء الدائنة (المدفوع مقدماً) ليطابق كشف الإجمالي
  const totalOutstanding = DB.customers.reduce((s, c) => s + balanceOf(c.id), 0);
  const rows = DB.customers.map((c) => {
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
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ---------- تبويب المبيعات اليومية ---------- */
function renderDailyTab() {
  const map = {};
  DB.bills.forEach((b) => {
    const key = b.date.slice(0, 10);
    if (!map[key]) map[key] = { total: 0, count: 0 };
    map[key].total += b.total;
    map[key].count += 1;
  });
  const keys = Object.keys(map).sort().reverse();
  if (keys.length === 0) {
    $("#tab-daily").innerHTML = '<p class="empty-msg">لا توجد مبيعات مسجلة.</p>';
    return;
  }
  const rows = keys.map((k) => `
    <tr>
      <td>${fmtDate(k)}</td>
      <td class="num">${map[k].count}</td>
      <td class="num">${fmtMoney(map[k].total)}</td>
    </tr>`).join("");
  const grand = keys.reduce((s, k) => s + map[k].total, 0);

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
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr><th>اليوم</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ---------- تبويب المبيعات الشهرية ---------- */
function renderMonthlyTab() {
  const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const map = {};
  DB.bills.forEach((b) => {
    const d = new Date(b.date);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    if (!map[key]) map[key] = { total: 0, count: 0, label: monthNames[d.getMonth()] + " " + d.getFullYear() };
    map[key].total += b.total;
    map[key].count += 1;
  });
  const keys = Object.keys(map).sort().reverse();
  if (keys.length === 0) {
    $("#tab-monthly").innerHTML = '<p class="empty-msg">لا توجد مبيعات مسجلة.</p>';
    return;
  }
  const rows = keys.map((k) => `
    <tr>
      <td>${map[k].label}</td>
      <td class="num">${map[k].count}</td>
      <td class="num">${fmtMoney(map[k].total)}</td>
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
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr><th>الشهر</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ---------- تبويب كشف الحسابات ---------- */
function renderStatementTab() {
  const rows = DB.customers.map((c) => {
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

  $("#tab-statement").innerHTML = `
    <p class="info-line">كشف حساب مختصر لكل عميل — اضغط على العميل لعرض التفاصيل الكاملة.</p>
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>العميل</th>
            <th>عدد الفواتير</th>
            <th>إجمالي الفواتير</th>
            <th>عدد الدفعات</th>
            <th>إجمالي الدفعات</th>
            <th>الرصيد المستحق</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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
      <td>${b.items.map((it) => `${it.description} (${it.count.toLocaleString("ar-EG")} × ${fmtMoney(it.price)})`).join("<br>")}</td>
      <td class="num">${b.items.reduce((x, it) => x + it.count, 0).toLocaleString("ar-EG")}</td>
      <td class="num">${fmtMoney(b.total)}</td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" onclick="openBillForm(${custId}, ${b.id})">تعديل</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBill(${b.id})">حذف</button>
      </td>
    </tr>`).join("") :
    '<tr><td colspan="7" class="empty-msg">لا توجد فواتير.</td></tr>';
  return `
    ${subpageHeader(custId, "الفواتير")}
    <div class="section-head">
      <p class="info-line" style="margin:0">إجمالي الفواتير: <b>${fmtMoney(totalBills(custId))}</b> — العدد: <b>${bills.length.toLocaleString("ar-EG")}</b></p>
      <button class="btn btn-primary btn-sm" onclick="openBillForm(${custId})">+ إضافة فاتورة</button>
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>رقم</th><th>رقم الكشف</th><th>التاريخ</th><th>الأصناف</th><th>عدد القطع</th><th>الإجمالي</th><th>إجراءات</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* --- صفحة الدفعات (مع تعديل/حذف) --- */
function renderPaymentsPage(custId) {
  const payments = paymentsOf(custId).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const rows = payments.length ? payments.map((p) => `
    <tr>
      <td>#${p.id}</td>
      <td class="num">${docCell(p.docNo)}</td>
      <td>${fmtDateTime(p.date)}</td>
      <td>${kindBadge(kindOf(p))}</td>
      <td class="num">${fmtMoney(p.amount)}</td>
      <td>${p.note || "—"}</td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" onclick="openPaymentForm(${custId}, ${p.id})">تعديل</button>
        <button class="btn btn-danger btn-sm" onclick="deletePayment(${p.id})">حذف</button>
      </td>
    </tr>`).join("") :
    '<tr><td colspan="7" class="empty-msg">لا توجد حركات.</td></tr>';
  return `
    ${subpageHeader(custId, "الدفعات والحركات")}
    <div class="section-head">
      <p class="info-line" style="margin:0">إجمالي الحركات الدائنة: <b>${fmtMoney(totalPayments(custId))}</b> — العدد: <b>${payments.length.toLocaleString("ar-EG")}</b></p>
      <button class="btn btn-success btn-sm" onclick="openPaymentForm(${custId})">+ إضافة دفعة</button>
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
