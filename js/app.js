/* =========================================================
   منطق التطبيق — واجهة أمامية بالكامل
   ========================================================= */

let DB = initDB();
let currentUser = null;

/* ---------- أدوات مساعدة ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

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

function toast(msg, danger) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (danger ? " danger" : "");
  setTimeout(() => t.classList.add("hidden"), 2600);
}

/* ---------- تسجيل الدخول ---------- */
$("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const u = $("#username").value.trim();
  const p = $("#password").value;
  const acc = USERS[u];
  if (!acc || acc.password !== p) {
    $("#login-error").textContent = "اسم المستخدم أو كلمة المرور غير صحيحة";
    return;
  }
  currentUser = { username: u, ...acc };
  $("#login-error").textContent = "";
  $("#login-form").reset();
  startApp();
});

$("#logout-btn").addEventListener("click", () => {
  currentUser = null;
  $("#app").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
});

function startApp() {
  $("#login-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#current-user").textContent =
    (currentUser.role === "manager" ? "المدير" : "الموظف") + ": " + currentUser.username;

  if (currentUser.role === "manager") {
    $("#employee-view").classList.add("hidden");
    $("#manager-view").classList.remove("hidden");
    renderManager();
  } else {
    $("#manager-view").classList.add("hidden");
    $("#employee-view").classList.remove("hidden");
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

/* ---------- نموذج فاتورة جديدة ---------- */
function openBillForm(custId) {
  const cust = customerById(custId);
  openModal("فاتورة جديدة — " + cust.name, `
    <p class="info-line">التاريخ: <b>${fmtDateTime(new Date().toISOString())}</b> (يُسجَّل تلقائياً)</p>
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
      <button class="btn btn-success" onclick="saveBill(${custId})">حفظ الفاتورة</button>
      <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    </div>
  `);
  addBillRow();
  addBillRow();
}

function addBillRow() {
  const tbody = $("#bill-rows");
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="it-desc" placeholder="وصف الصنف" /></td>
    <td><input type="number" class="it-count" min="0" value="1" oninput="recalcBill()" /></td>
    <td><input type="number" class="it-price" min="0" value="0" oninput="recalcBill()" /></td>
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

function saveBill(custId) {
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
  DB.seq.bill++;
  DB.bills.push({
    id: DB.seq.bill,
    customerId: custId,
    date: new Date().toISOString(),
    items,
    total
  });
  saveDB(DB);
  closeModal();
  toast("تم حفظ الفاتورة بنجاح");
}

/* ---------- نموذج دفعة جديدة ---------- */
function openPaymentForm(custId) {
  const cust = customerById(custId);
  openModal("دفعة جديدة — " + cust.name, `
    <p class="info-line">التاريخ: <b>${fmtDateTime(new Date().toISOString())}</b> (يُسجَّل تلقائياً)</p>
    <div class="field">
      <label>المبلغ المدفوع</label>
      <input type="number" id="pay-amount" min="0" placeholder="0" />
    </div>
    <div class="field">
      <label>ملاحظة</label>
      <textarea id="pay-note" placeholder="ملاحظة اختيارية..."></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-success" onclick="savePayment(${custId})">حفظ الدفعة</button>
      <button class="btn btn-outline" onclick="closeModal()">إلغاء</button>
    </div>
  `);
}

function savePayment(custId) {
  const amount = Number($("#pay-amount").value) || 0;
  const note = $("#pay-note").value.trim();
  if (amount <= 0) {
    toast("الرجاء إدخال مبلغ صحيح", true);
    return;
  }
  DB.seq.payment++;
  DB.payments.push({
    id: DB.seq.payment,
    customerId: custId,
    date: new Date().toISOString(),
    amount,
    note
  });
  saveDB(DB);
  closeModal();
  toast("تم حفظ الدفعة بنجاح");
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
}

/* ---------- تبويب العملاء ---------- */
function renderClientsTab() {
  const totalOutstanding = DB.customers.reduce((s, c) => s + Math.max(balanceOf(c.id), 0), 0);
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
    <p class="info-line">اضغط على أي عميل لعرض ملفه الكامل.</p>
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>اسم العميل</th>
            <th>إجمالي الفواتير</th>
            <th>إجمالي الدفعات</th>
            <th>الرصيد المستحق</th>
            <th>الحالة</th>
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

/* ---------- ملف العميل الكامل ---------- */
function openClientProfile(custId) {
  const c = customerById(custId);
  const bills = billsOf(custId).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const payments = paymentsOf(custId).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const bal = balanceOf(custId);

  const billsHtml = bills.length ? bills.map((b) => `
    <tr>
      <td>#${b.id}</td>
      <td>${fmtDateTime(b.date)}</td>
      <td>${b.items.map((it) => `${it.description} (${it.count.toLocaleString("ar-EG")}×${it.price.toLocaleString("ar-EG")})`).join("<br>")}</td>
      <td class="num">${fmtMoney(b.total)}</td>
    </tr>`).join("") :
    '<tr><td colspan="4" class="empty-msg">لا توجد فواتير.</td></tr>';

  const paymentsHtml = payments.length ? payments.map((p) => `
    <tr>
      <td>#${p.id}</td>
      <td>${fmtDateTime(p.date)}</td>
      <td class="num">${fmtMoney(p.amount)}</td>
      <td>${p.note || "—"}</td>
    </tr>`).join("") :
    '<tr><td colspan="4" class="empty-msg">لا توجد دفعات.</td></tr>';

  const balCls = bal > 0 ? "pos" : "zero";

  openModal("ملف العميل — " + c.name, `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">إجمالي الفواتير</div>
        <div class="stat-value">${fmtMoney(totalBills(custId))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">إجمالي الدفعات</div>
        <div class="stat-value">${fmtMoney(totalPayments(custId))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">الرصيد المستحق</div>
        <div class="stat-value ${balCls}">${fmtMoney(bal)}</div>
      </div>
    </div>

    <div class="profile-section">
      <h4>الفواتير</h4>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>رقم</th><th>التاريخ</th><th>الأصناف</th><th>الإجمالي</th></tr></thead>
          <tbody>${billsHtml}</tbody>
        </table>
      </div>
    </div>

    <div class="profile-section">
      <h4>الدفعات</h4>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>رقم</th><th>التاريخ</th><th>المبلغ</th><th>ملاحظة</th></tr></thead>
          <tbody>${paymentsHtml}</tbody>
        </table>
      </div>
    </div>
  `);
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
$("#modal-close").addEventListener("click", closeModal);
$("#modal-overlay").addEventListener("click", (e) => {
  if (e.target === $("#modal-overlay")) closeModal();
});
