/* =========================================================
   طبقة التخزين — تعمل بوضعين:
   - supabase: عند ضبط المفاتيح في config.js (قاعدة بيانات على الخادم)
   - local: احتياطي محلي (localStorage) عند غياب المفاتيح
   جميع تعديلات البيانات تمرّ من هنا وتُحدِّث الذاكرة (DB) مباشرةً.
   ========================================================= */
const Store = (function () {
  const cfg = window.APP_CONFIG || {};
  const hasKeys = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const useSupabase = hasKeys && !!(window.supabase && window.supabase.createClient);
  const domain = cfg.AUTH_EMAIL_DOMAIN || "azacounting.app";
  let sb = null;
  if (useSupabase) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  /* تحويل صفوف الخادم إلى شكل التطبيق */
  const mapCustomer = (r) => ({ id: r.id, name: r.name });
  const mapBill = (r) => ({ id: r.id, customerId: r.customer_id, date: r.created_at, items: r.items || [], total: Number(r.total) || 0, docNo: r.doc_no || "" });
  const mapPayment = (r) => ({ id: r.id, customerId: r.customer_id, date: r.created_at, amount: Number(r.amount) || 0, note: r.note || "", docNo: r.doc_no || "", kind: r.kind || "payment" });

  return {
    mode: useSupabase ? "supabase" : "local",
    configured: hasKeys,
    ready: !hasKeys || useSupabase, // إن كانت المفاتيح مضبوطة لكن المكتبة لم تُحمّل → غير جاهز

    /* ---------- المصادقة ---------- */
    async signIn(username, password) {
      if (!useSupabase) {
        const acc = USERS[username];
        if (!acc || acc.password !== password) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
        return { username, role: acc.role, userId: username };
      }
      const email = username.includes("@") ? username : username + "@" + domain;
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
      const { data: prof } = await sb.from("profiles").select("username, role").eq("id", data.user.id).single();
      return { username: (prof && prof.username) || username, role: (prof && prof.role) || "employee", userId: data.user.id };
    },
    async signOut() {
      if (useSupabase) { try { await sb.auth.signOut(); } catch (e) {} }
    },
    async restoreSession() {
      if (!useSupabase) return null;
      const { data } = await sb.auth.getSession();
      if (!data || !data.session) return null;
      const uid = data.session.user.id;
      const { data: prof } = await sb.from("profiles").select("username, role").eq("id", uid).single();
      if (!prof) return null;
      return { username: prof.username, role: prof.role, userId: uid };
    },

    /* ---------- تحميل كل البيانات إلى الذاكرة ---------- */
    // جلب كل الصفوف على دفعات لتجاوز حد Supabase الأقصى (1000 صف لكل طلب)
    async fetchAllRows(table) {
      const pageSize = 1000;
      let from = 0;
      let all = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await sb
          .from(table)
          .select("*")
          .order("id")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        all = all.concat(data);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
    async loadAll() {
      if (!useSupabase) return; // DB محمّل مسبقاً من localStorage
      const [c, b, p] = await Promise.all([
        this.fetchAllRows("customers"),
        this.fetchAllRows("bills"),
        this.fetchAllRows("payments")
      ]);
      DB.customers = c.map(mapCustomer);
      DB.bills = b.map(mapBill);
      DB.payments = p.map(mapPayment);
    },

    /* ---------- العملاء ---------- */
    async addCustomer(name) {
      if (!useSupabase) {
        const c = { id: nextCustomerId(), name };
        DB.customers.push(c); saveDB(DB); return c;
      }
      const { data, error } = await sb.from("customers").insert({ name }).select().single();
      if (error) throw error;
      const c = mapCustomer(data); DB.customers.push(c); return c;
    },
    async updateCustomer(id, name) {
      if (useSupabase) { const { error } = await sb.from("customers").update({ name }).eq("id", id); if (error) throw error; }
      const c = customerById(id); if (c) c.name = name;
      if (!useSupabase) saveDB(DB);
    },
    async deleteCustomer(id) {
      if (useSupabase) { const { error } = await sb.from("customers").delete().eq("id", id); if (error) throw error; }
      DB.customers = DB.customers.filter((x) => x.id !== id);
      DB.bills = DB.bills.filter((b) => b.customerId !== id);
      DB.payments = DB.payments.filter((p) => p.customerId !== id);
      if (!useSupabase) saveDB(DB);
    },

    /* ---------- الفواتير ---------- */
    async addBill(customerId, items, total, docNo) {
      docNo = docNo || "";
      if (!useSupabase) {
        DB.seq.bill++;
        const bill = { id: DB.seq.bill, customerId, date: new Date().toISOString(), items, total, docNo };
        DB.bills.push(bill); saveDB(DB); return bill;
      }
      const { data, error } = await sb.from("bills").insert({ customer_id: customerId, items, total, doc_no: docNo }).select().single();
      if (error) throw error;
      const bill = mapBill(data); DB.bills.push(bill); return bill;
    },
    async updateBill(id, items, total, docNo) {
      docNo = docNo || "";
      if (useSupabase) { const { error } = await sb.from("bills").update({ items, total, doc_no: docNo }).eq("id", id); if (error) throw error; }
      const bl = DB.bills.find((b) => b.id === id); if (bl) { bl.items = items; bl.total = total; bl.docNo = docNo; }
      if (!useSupabase) saveDB(DB);
    },
    async deleteBill(id) {
      if (useSupabase) { const { error } = await sb.from("bills").delete().eq("id", id); if (error) throw error; }
      DB.bills = DB.bills.filter((b) => b.id !== id);
      if (!useSupabase) saveDB(DB);
    },

    /* ---------- الدفعات ---------- */
    async addPayment(customerId, amount, note, docNo, kind) {
      docNo = docNo || ""; kind = kind || "payment";
      if (!useSupabase) {
        DB.seq.payment++;
        const pay = { id: DB.seq.payment, customerId, date: new Date().toISOString(), amount, note, docNo, kind };
        DB.payments.push(pay); saveDB(DB); return pay;
      }
      const { data, error } = await sb.from("payments").insert({ customer_id: customerId, amount, note, doc_no: docNo, kind }).select().single();
      if (error) throw error;
      const pay = mapPayment(data); DB.payments.push(pay); return pay;
    },
    async updatePayment(id, amount, note, docNo) {
      docNo = docNo || "";
      if (useSupabase) { const { error } = await sb.from("payments").update({ amount, note, doc_no: docNo }).eq("id", id); if (error) throw error; }
      const py = DB.payments.find((p) => p.id === id); if (py) { py.amount = amount; py.note = note; py.docNo = docNo; }
      if (!useSupabase) saveDB(DB);
    },
    async deletePayment(id) {
      if (useSupabase) { const { error } = await sb.from("payments").delete().eq("id", id); if (error) throw error; }
      DB.payments = DB.payments.filter((p) => p.id !== id);
      if (!useSupabase) saveDB(DB);
    },

    /* ---------- طلبات الدخول (موافقة المدير) ---------- */
    async createLoginRequest(userId, username, device) {
      if (!useSupabase) {
        const arr = lrLoad();
        const id = (arr.reduce((m, r) => Math.max(m, r.id), 0) || 0) + 1;
        arr.push({ id, userId, username, device, status: "pending", created_at: new Date().toISOString() });
        lrSave(arr);
        return { id };
      }
      const { data, error } = await sb.from("login_requests")
        .insert({ user_id: userId, username, device, status: "pending" }).select().single();
      if (error) throw error;
      return { id: data.id };
    },
    async getLoginRequestStatus(id) {
      if (!useSupabase) { const r = lrLoad().find((x) => x.id === id); return r ? r.status : "rejected"; }
      const { data, error } = await sb.from("login_requests").select("status").eq("id", id).single();
      if (error) throw error;
      return data.status;
    },
    async listPendingLoginRequests() {
      if (!useSupabase) { return lrLoad().filter((r) => r.status === "pending"); }
      const { data, error } = await sb.from("login_requests").select("*").eq("status", "pending").order("created_at");
      if (error) throw error;
      return data.map((r) => ({ id: r.id, userId: r.user_id, username: r.username, device: r.device, status: r.status, created_at: r.created_at }));
    },
    async decideLoginRequest(id, approve) {
      const status = approve ? "approved" : "rejected";
      if (!useSupabase) {
        const arr = lrLoad(); const r = arr.find((x) => x.id === id);
        if (r) r.status = status;
        lrSave(arr); return;
      }
      const { error } = await sb.from("login_requests").update({ status, decided_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    }
  };

  function lrLoad() { try { return JSON.parse(localStorage.getItem("login_requests_v1") || "[]"); } catch (e) { return []; } }
  function lrSave(a) { try { localStorage.setItem("login_requests_v1", JSON.stringify(a)); } catch (e) {} }
})();
