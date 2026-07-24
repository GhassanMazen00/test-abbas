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
  const mapPayment = (r) => ({ id: r.id, customerId: r.customer_id, date: r.created_at, amount: Number(r.amount) || 0, note: r.note || "", docNo: r.doc_no || "", kind: r.kind || "payment", items: r.items || [] });
  const mapCancelled = (r) => ({ id: r.id, docNo: r.doc_no || "", customerName: r.customer_name || "", items: r.items || [], total: Number(r.total) || 0, reason: r.reason || "", date: r.created_at });

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
      // الفواتير الملغية (للمدير فقط) — منفصلة تماماً؛ آمنة إن لم يوجد الجدول
      DB.cancelled = [];
      try { DB.cancelled = (await this.fetchAllRows("cancelled_invoices")).map(mapCancelled); } catch (e) { DB.cancelled = []; }
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
    async updateBill(id, items, total, docNo, dateISO) {
      docNo = docNo || "";
      const patch = { items, total, doc_no: docNo };
      if (dateISO) patch.created_at = dateISO;
      if (useSupabase) { const { error } = await sb.from("bills").update(patch).eq("id", id); if (error) throw error; }
      const bl = DB.bills.find((b) => b.id === id); if (bl) { bl.items = items; bl.total = total; bl.docNo = docNo; if (dateISO) bl.date = dateISO; }
      if (!useSupabase) saveDB(DB);
    },
    async deleteBill(id) {
      if (useSupabase) { const { error } = await sb.from("bills").delete().eq("id", id); if (error) throw error; }
      DB.bills = DB.bills.filter((b) => b.id !== id);
      if (!useSupabase) saveDB(DB);
    },

    /* ---------- الدفعات ---------- */
    async addPayment(customerId, amount, note, docNo, kind, items) {
      docNo = docNo || ""; kind = kind || "payment"; items = items || [];
      if (!useSupabase) {
        DB.seq.payment++;
        const pay = { id: DB.seq.payment, customerId, date: new Date().toISOString(), amount, note, docNo, kind, items };
        DB.payments.push(pay); saveDB(DB); return pay;
      }
      const { data, error } = await sb.from("payments").insert({ customer_id: customerId, amount, note, doc_no: docNo, kind, items }).select().single();
      if (error) throw error;
      const pay = mapPayment(data); DB.payments.push(pay); return pay;
    },
    async updatePayment(id, amount, note, docNo, dateISO, items) {
      docNo = docNo || "";
      const patch = { amount, note, doc_no: docNo };
      if (dateISO) patch.created_at = dateISO;
      if (items !== undefined) patch.items = items;
      if (useSupabase) { const { error } = await sb.from("payments").update(patch).eq("id", id); if (error) throw error; }
      const py = DB.payments.find((p) => p.id === id); if (py) { py.amount = amount; py.note = note; py.docNo = docNo; if (dateISO) py.date = dateISO; if (items !== undefined) py.items = items; }
      if (!useSupabase) saveDB(DB);
    },
    async deletePayment(id) {
      if (useSupabase) { const { error } = await sb.from("payments").delete().eq("id", id); if (error) throw error; }
      DB.payments = DB.payments.filter((p) => p.id !== id);
      if (!useSupabase) saveDB(DB);
    },

    /* ---------- الفواتير الملغية (منفصلة تماماً) ---------- */
    async addCancelledInvoice(docNo, customerName, items, total, reason, dateISO) {
      docNo = docNo || ""; customerName = customerName || ""; items = items || []; reason = reason || "";
      if (!useSupabase) {
        if (!DB.seq.cancelled) DB.seq.cancelled = 0;
        DB.seq.cancelled++;
        const rec = { id: DB.seq.cancelled, docNo, customerName, items, total, reason, date: dateISO || new Date().toISOString() };
        DB.cancelled.push(rec); saveDB(DB); return rec;
      }
      const payload = { doc_no: docNo, customer_name: customerName, items, total, reason };
      if (dateISO) payload.created_at = dateISO;
      // بدون .select() لأن سياسة القراءة للمدير فقط (القراءة بعد الإدراج تفشل لغير المدير)
      const { error } = await sb.from("cancelled_invoices").insert(payload);
      if (error) throw error;
      // حدّث النسخة المحلية إن كان المستخدم يملك صلاحية القراءة (المدير)
      try { DB.cancelled = (await this.fetchAllRows("cancelled_invoices")).map(mapCancelled); } catch (e) {}
      return null;
    },
    async updateCancelledInvoice(id, docNo, customerName, items, total, reason, dateISO) {
      docNo = docNo || ""; customerName = customerName || ""; items = items || []; reason = reason || "";
      const patch = { doc_no: docNo, customer_name: customerName, items, total, reason };
      if (dateISO) patch.created_at = dateISO;
      if (useSupabase) { const { error } = await sb.from("cancelled_invoices").update(patch).eq("id", id); if (error) throw error; }
      const rec = DB.cancelled.find((x) => x.id === id);
      if (rec) { rec.docNo = docNo; rec.customerName = customerName; rec.items = items; rec.total = total; rec.reason = reason; if (dateISO) rec.date = dateISO; }
      if (!useSupabase) saveDB(DB);
    },
    async deleteCancelledInvoice(id) {
      if (useSupabase) { const { error } = await sb.from("cancelled_invoices").delete().eq("id", id); if (error) throw error; }
      DB.cancelled = DB.cancelled.filter((x) => x.id !== id);
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
    },

    /* ---------- إدخالات بانتظار المراجعة (worker1 → worker2) ---------- */
    async createPendingEntry(kind, customerId, customerName, payload, createdBy) {
      if (!useSupabase) {
        const arr = peLoad();
        const id = (arr.reduce((m, r) => Math.max(m, r.id), 0) || 0) + 1;
        arr.push({ id, kind, customerId, customerName, payload, createdBy, status: "pending", created_at: new Date().toISOString() });
        peSave(arr);
        return { id };
      }
      const { data, error } = await sb.from("pending_entries")
        .insert({ kind, customer_id: customerId, customer_name: customerName, payload, created_by: createdBy, status: "pending" })
        .select().single();
      if (error) throw error;
      return { id: data.id };
    },
    async listPendingEntries() {
      if (!useSupabase) return peLoad().filter((r) => r.status === "pending").map(mapPending);
      const { data, error } = await sb.from("pending_entries").select("*").eq("status", "pending").order("created_at");
      if (error) throw error;
      return data.map(mapPending);
    },
    async listRejectedEntries(createdBy) {
      if (!useSupabase) return peLoad().filter((r) => r.status === "rejected" && (!createdBy || r.createdBy === createdBy)).map(mapPending);
      let q = sb.from("pending_entries").select("*").eq("status", "rejected");
      if (createdBy) q = q.eq("created_by", createdBy);
      const { data, error } = await q.order("decided_at", { ascending: false });
      if (error) throw error;
      return data.map(mapPending);
    },
    async decidePendingEntry(id, approve, decidedBy, reason) {
      const status = approve ? "approved" : "rejected";
      const rej = approve ? null : (reason || "");
      if (!useSupabase) {
        const arr = peLoad(); const r = arr.find((x) => x.id === id);
        if (r) { r.status = status; r.decided_by = decidedBy; r.decided_at = new Date().toISOString(); r.reject_reason = rej; }
        peSave(arr); return;
      }
      const { error } = await sb.from("pending_entries")
        .update({ status, decided_by: decidedBy, decided_at: new Date().toISOString(), reject_reason: rej }).eq("id", id);
      if (error) throw error;
    },
    async deletePendingEntry(id) {
      if (!useSupabase) { peSave(peLoad().filter((x) => x.id !== id)); return; }
      const { error } = await sb.from("pending_entries").delete().eq("id", id);
      if (error) throw error;
    },
    async deleteRejectedEntries(createdBy) {
      if (!useSupabase) {
        peSave(peLoad().filter((x) => !(x.status === "rejected" && (!createdBy || x.createdBy === createdBy))));
        return;
      }
      let q = sb.from("pending_entries").delete().eq("status", "rejected");
      if (createdBy) q = q.eq("created_by", createdBy);
      const { error } = await q;
      if (error) throw error;
    },

    /* ---------- الجلسات النشطة (إدارة المستخدمين) ---------- */
    async createSession(userId, username, device) {
      if (!useSupabase) {
        const arr = asLoad();
        const id = (arr.reduce((m, r) => Math.max(m, r.id), 0) || 0) + 1;
        arr.push({ id, userId, username, device, last_seen: new Date().toISOString(), signed_out: false });
        asSave(arr); return { id };
      }
      const { data, error } = await sb.from("active_sessions")
        .insert({ user_id: userId, username, device, last_seen: new Date().toISOString(), signed_out: false }).select().single();
      if (error) throw error;
      return { id: data.id };
    },
    async heartbeatSession(id) {
      if (!useSupabase) { const arr = asLoad(); const r = arr.find((x) => x.id === id); if (r) r.last_seen = new Date().toISOString(); asSave(arr); return; }
      const { error } = await sb.from("active_sessions").update({ last_seen: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    async getSessionState(id) {
      if (!useSupabase) { const r = asLoad().find((x) => x.id === id); return r ? (r.signed_out ? "signed_out" : "active") : "gone"; }
      const { data, error } = await sb.from("active_sessions").select("signed_out").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return "gone";
      return data.signed_out ? "signed_out" : "active";
    },
    async listActiveSessions() {
      const cutoff = new Date(Date.now() - 90000).toISOString();
      if (!useSupabase) { return asLoad().filter((r) => !r.signed_out && r.last_seen > cutoff).sort((a, b) => b.last_seen.localeCompare(a.last_seen)); }
      const { data, error } = await sb.from("active_sessions").select("*").eq("signed_out", false).gte("last_seen", cutoff).order("last_seen", { ascending: false });
      if (error) throw error;
      return data.map((r) => ({ id: r.id, userId: r.user_id, username: r.username, device: r.device, last_seen: r.last_seen }));
    },
    async forceSignOut(id) {
      if (!useSupabase) { const arr = asLoad(); const r = arr.find((x) => x.id === id); if (r) r.signed_out = true; asSave(arr); return; }
      const { error } = await sb.from("active_sessions").update({ signed_out: true }).eq("id", id);
      if (error) throw error;
    },
    async endSession(id) {
      if (!useSupabase) { asSave(asLoad().filter((x) => x.id !== id)); return; }
      const { error } = await sb.from("active_sessions").delete().eq("id", id);
      if (error) throw error;
    }
  };

  function asLoad() { try { return JSON.parse(localStorage.getItem("active_sessions_v1") || "[]"); } catch (e) { return []; } }
  function asSave(a) { try { localStorage.setItem("active_sessions_v1", JSON.stringify(a)); } catch (e) {} }

  function mapPending(r) {
    return {
      id: r.id, kind: r.kind,
      customerId: r.customer_id != null ? r.customer_id : r.customerId,
      customerName: r.customer_name != null ? r.customer_name : r.customerName,
      payload: r.payload || {}, createdBy: r.created_by != null ? r.created_by : r.createdBy,
      status: r.status, created_at: r.created_at, decided_at: r.decided_at, decidedBy: r.decided_by,
      rejectReason: (r.reject_reason != null ? r.reject_reason : r.rejectReason) || ""
    };
  }
  function lrLoad() { try { return JSON.parse(localStorage.getItem("login_requests_v1") || "[]"); } catch (e) { return []; } }
  function lrSave(a) { try { localStorage.setItem("login_requests_v1", JSON.stringify(a)); } catch (e) {} }
  function peLoad() { try { return JSON.parse(localStorage.getItem("pending_entries_v1") || "[]"); } catch (e) { return []; } }
  function peSave(a) { try { localStorage.setItem("pending_entries_v1", JSON.stringify(a)); } catch (e) {} }
})();
