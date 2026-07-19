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
  const mapBill = (r) => ({ id: r.id, customerId: r.customer_id, date: r.created_at, items: r.items || [], total: Number(r.total) || 0 });
  const mapPayment = (r) => ({ id: r.id, customerId: r.customer_id, date: r.created_at, amount: Number(r.amount) || 0, note: r.note || "" });

  return {
    mode: useSupabase ? "supabase" : "local",
    configured: hasKeys,
    ready: !hasKeys || useSupabase, // إن كانت المفاتيح مضبوطة لكن المكتبة لم تُحمّل → غير جاهز

    /* ---------- المصادقة ---------- */
    async signIn(username, password) {
      if (!useSupabase) {
        const acc = USERS[username];
        if (!acc || acc.password !== password) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
        return { username, role: acc.role };
      }
      const email = username.includes("@") ? username : username + "@" + domain;
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
      const { data: prof } = await sb.from("profiles").select("username, role").eq("id", data.user.id).single();
      return { username: (prof && prof.username) || username, role: (prof && prof.role) || "employee" };
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
      return { username: prof.username, role: prof.role };
    },

    /* ---------- تحميل كل البيانات إلى الذاكرة ---------- */
    async loadAll() {
      if (!useSupabase) return; // DB محمّل مسبقاً من localStorage
      const [c, b, p] = await Promise.all([
        sb.from("customers").select("*").order("id"),
        sb.from("bills").select("*").order("created_at"),
        sb.from("payments").select("*").order("created_at")
      ]);
      if (c.error) throw c.error;
      if (b.error) throw b.error;
      if (p.error) throw p.error;
      DB.customers = c.data.map(mapCustomer);
      DB.bills = b.data.map(mapBill);
      DB.payments = p.data.map(mapPayment);
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
    async addBill(customerId, items, total) {
      if (!useSupabase) {
        DB.seq.bill++;
        const bill = { id: DB.seq.bill, customerId, date: new Date().toISOString(), items, total };
        DB.bills.push(bill); saveDB(DB); return bill;
      }
      const { data, error } = await sb.from("bills").insert({ customer_id: customerId, items, total }).select().single();
      if (error) throw error;
      const bill = mapBill(data); DB.bills.push(bill); return bill;
    },
    async updateBill(id, items, total) {
      if (useSupabase) { const { error } = await sb.from("bills").update({ items, total }).eq("id", id); if (error) throw error; }
      const bl = DB.bills.find((b) => b.id === id); if (bl) { bl.items = items; bl.total = total; }
      if (!useSupabase) saveDB(DB);
    },
    async deleteBill(id) {
      if (useSupabase) { const { error } = await sb.from("bills").delete().eq("id", id); if (error) throw error; }
      DB.bills = DB.bills.filter((b) => b.id !== id);
      if (!useSupabase) saveDB(DB);
    },

    /* ---------- الدفعات ---------- */
    async addPayment(customerId, amount, note) {
      if (!useSupabase) {
        DB.seq.payment++;
        const pay = { id: DB.seq.payment, customerId, date: new Date().toISOString(), amount, note };
        DB.payments.push(pay); saveDB(DB); return pay;
      }
      const { data, error } = await sb.from("payments").insert({ customer_id: customerId, amount, note }).select().single();
      if (error) throw error;
      const pay = mapPayment(data); DB.payments.push(pay); return pay;
    },
    async updatePayment(id, amount, note) {
      if (useSupabase) { const { error } = await sb.from("payments").update({ amount, note }).eq("id", id); if (error) throw error; }
      const py = DB.payments.find((p) => p.id === id); if (py) { py.amount = amount; py.note = note; }
      if (!useSupabase) saveDB(DB);
    },
    async deletePayment(id) {
      if (useSupabase) { const { error } = await sb.from("payments").delete().eq("id", id); if (error) throw error; }
      DB.payments = DB.payments.filter((p) => p.id !== id);
      if (!useSupabase) saveDB(DB);
    }
  };
})();
