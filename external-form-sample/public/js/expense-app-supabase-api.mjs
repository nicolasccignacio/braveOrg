/**
 * Expense UI backed by Supabase Postgres (auth + RLS). Same method shapes as ExpenseAppLocal.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export function buildExpenseAppSupabase(supabase) {
  const ITEMS = "expense_catalog_items";
  const EXPENSES = "expense_entries";

  function genSfLikeId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
    let s = "";
    for (let i = 0; i < 15; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  function isValidId(id) {
    return typeof id === "string" && /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id.trim());
  }

  function monthKey(expenseDate, createdDate) {
    const ed = expenseDate != null ? String(expenseDate) : "";
    if (ed.length >= 7 && /^\d{4}-\d{2}/.test(ed)) return ed.slice(0, 7);
    const cd = createdDate != null ? String(createdDate) : "";
    if (cd.length >= 7 && /^\d{4}-\d{2}/.test(cd)) return cd.slice(0, 7);
    return "unknown";
  }

  function monthLabel(key) {
    if (key === "unknown") return "Unknown date";
    const parts = key.split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
    return new Date(y, m - 1, 1).toLocaleString("en", { month: "short", year: "numeric" });
  }

  function lineAmount(price, quantity) {
    const p = parseFloat(price);
    const q = parseFloat(quantity);
    if (!Number.isFinite(p) || !Number.isFinite(q)) return 0;
    return p * q;
  }

  function buildDashboardAggregates(records, lim) {
    const monthMap = {};
    const itemMap = {};
    let amountSum = 0;

    records.forEach((r) => {
      const amt = lineAmount(r.price, r.quantity);
      amountSum += amt;
      const mk = monthKey(r.expenseDate, r.createdDate);
      monthMap[mk] = (monthMap[mk] || 0) + amt;
      const nm =
        r.itemName != null && String(r.itemName).trim() !== "" ? String(r.itemName).trim() : "—";
      const prev = itemMap[nm] || { total: 0, count: 0 };
      prev.total += amt;
      prev.count += 1;
      itemMap[nm] = prev;
    });

    const byMonth = Object.keys(monthMap)
      .map((key) => ({
        key,
        label: monthLabel(key),
        total: Math.round(monthMap[key] * 100) / 100,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));

    const byItem = Object.keys(itemMap)
      .map((name) => {
        const v = itemMap[name];
        return { name, total: Math.round(v.total * 100) / 100, count: v.count };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    return {
      totals: {
        expenseCount: records.length,
        amountSum: Math.round(amountSum * 100) / 100,
      },
      byMonth,
      byItem,
      meta: { queryLimit: lim, recordCount: records.length },
    };
  }

  function mapExpenseRow(r) {
    return {
      id: r.id,
      name: r.name != null ? String(r.name) : r.id,
      itemId: r.item_id,
      itemName: r.item_name != null ? String(r.item_name) : "—",
      price: r.price != null ? Number(r.price) : null,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      expenseDate: r.expense_date != null ? String(r.expense_date).slice(0, 10) : null,
      cuotas: r.cuotas,
      referencia: r.referencia,
      createdDate: r.created_at,
    };
  }

  async function requireUser() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw new Error(error.message || "Auth error.");
    if (!session?.user) throw new Error("Sign in to Supabase to sync data to the cloud.");
    return session.user;
  }

  function errFromSupabase(err, fallback) {
    if (!err) return new Error(fallback);
    return new Error(err.message || err.details || fallback);
  }

  async function insertChunks(table, rows, chunkSize) {
    const size = chunkSize || 400;
    for (let i = 0; i < rows.length; i += size) {
      const batch = rows.slice(i, i + size);
      const { error } = await supabase.from(table).insert(batch);
      if (error) throw errFromSupabase(error, "Insert failed.");
    }
  }

  return {
    usesSalesforceBackend() {
      return false;
    },

    usesSupabaseBackend() {
      return true;
    },

    async searchItems(q, limit) {
      await requireUser();
      const raw = String(q || "").trim();
      const lim = Math.min(Math.max(parseInt(limit, 10) || (raw ? 50 : 2000), 1), 2000);
      const fetchCap = 2000;
      const { data, error } = await supabase
        .from(ITEMS)
        .select("id,name")
        .order("name", { ascending: true })
        .limit(fetchCap);
      if (error) throw errFromSupabase(error, "Could not load items.");
      let list = (data || []).map((r) => ({ id: r.id, name: r.name }));
      if (raw) {
        const lower = raw.toLowerCase();
        list = list.filter((it) => String(it.name).toLowerCase().includes(lower));
      }
      return { records: list.slice(0, lim) };
    },

    async listHistory(limit) {
      await requireUser();
      const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      const { data, error } = await supabase
        .from(EXPENSES)
        .select(
          "id,name,item_id,item_name,price,quantity,expense_date,cuotas,referencia,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(lim);
      if (error) throw errFromSupabase(error, "Could not load history.");
      return { records: (data || []).map(mapExpenseRow) };
    },

    async submitExpense(payload) {
      if (payload.website != null && String(payload.website).trim() !== "") {
        return Promise.reject(new Error("Invalid request"));
      }
      const user = await requireUser();
      const itemId = String(payload.itemId || "").trim();
      if (!itemId || !isValidId(itemId)) {
        return Promise.reject(new Error("Select a valid item from search."));
      }
      const { data: itemRow, error: itemErr } = await supabase
        .from(ITEMS)
        .select("id,name")
        .eq("id", itemId)
        .maybeSingle();
      if (itemErr) throw errFromSupabase(itemErr, "Item lookup failed.");
      if (!itemRow) return Promise.reject(new Error("Item not found."));
      const id = genSfLikeId();
      const row = {
        id,
        user_id: user.id,
        name: "EXP-" + id.slice(0, 8),
        item_id: itemId,
        item_name: itemRow.name,
        price:
          payload.price != null && payload.price !== "" ? Number(payload.price) : null,
        quantity:
          payload.quantity != null && payload.quantity !== ""
            ? Number(payload.quantity)
            : null,
        expense_date: payload.expenseDate || null,
        cuotas:
          payload.cuotas != null && payload.cuotas !== "" ? parseInt(payload.cuotas, 10) : null,
        referencia:
          payload.referencia != null ? String(payload.referencia).trim() || null : null,
      };
      const { error } = await supabase.from(EXPENSES).insert(row);
      if (error) throw errFromSupabase(error, "Could not save expense.");
      return { id, success: true };
    },

    async updateExpense(payload) {
      if (payload.website != null && String(payload.website).trim() !== "") {
        return Promise.reject(new Error("Invalid request"));
      }
      await requireUser();
      const recordId = String(payload.recordId || payload.id || "").trim();
      if (!recordId || !isValidId(recordId)) {
        return Promise.reject(new Error("recordId is required"));
      }
      const itemId = String(payload.itemId || "").trim();
      if (!itemId || !isValidId(itemId)) {
        return Promise.reject(new Error("Select a valid item."));
      }
      const { data: itemRow, error: itemErr } = await supabase
        .from(ITEMS)
        .select("id,name")
        .eq("id", itemId)
        .maybeSingle();
      if (itemErr) throw errFromSupabase(itemErr, "Item lookup failed.");
      if (!itemRow) return Promise.reject(new Error("Item not found."));
      const { data: cur, error: curErr } = await supabase
        .from(EXPENSES)
        .select("price,quantity,expense_date,cuotas,referencia")
        .eq("id", recordId)
        .maybeSingle();
      if (curErr) throw errFromSupabase(curErr, "Record lookup failed.");
      if (!cur) return Promise.reject(new Error("Record not found."));
      const patch = {
        item_id: itemId,
        item_name: itemRow.name,
        price:
          payload.price != null && payload.price !== ""
            ? Number(payload.price)
            : cur.price != null
              ? Number(cur.price)
              : null,
        quantity:
          payload.quantity != null && payload.quantity !== ""
            ? Number(payload.quantity)
            : cur.quantity != null
              ? Number(cur.quantity)
              : null,
        expense_date:
          payload.expenseDate !== undefined && payload.expenseDate !== ""
            ? payload.expenseDate
            : cur.expense_date != null
              ? String(cur.expense_date).slice(0, 10)
              : null,
        cuotas:
          payload.cuotas != null && payload.cuotas !== ""
            ? parseInt(payload.cuotas, 10)
            : cur.cuotas,
        referencia:
          payload.referencia != null
            ? String(payload.referencia).trim() || null
            : cur.referencia,
      };
      const { error } = await supabase.from(EXPENSES).update(patch).eq("id", recordId);
      if (error) throw errFromSupabase(error, "Update failed.");
      return { success: true };
    },

    async deleteExpense(payload) {
      if (payload.website != null && String(payload.website).trim() !== "") {
        return Promise.reject(new Error("Invalid request"));
      }
      await requireUser();
      const recordId = String(payload.recordId || payload.id || "").trim();
      if (!recordId || !isValidId(recordId)) {
        return Promise.reject(new Error("recordId is required"));
      }
      const { data: existing, error: selErr } = await supabase
        .from(EXPENSES)
        .select("id")
        .eq("id", recordId)
        .maybeSingle();
      if (selErr) throw errFromSupabase(selErr, "Lookup failed.");
      if (!existing) return Promise.reject(new Error("Record not found."));
      const { error } = await supabase.from(EXPENSES).delete().eq("id", recordId);
      if (error) throw errFromSupabase(error, "Delete failed.");
      return { success: true };
    },

    async createItem(name) {
      const user = await requireUser();
      const n = String(name || "").trim();
      if (!n) return Promise.reject(new Error("name is required"));
      const id = genSfLikeId();
      const { error } = await supabase.from(ITEMS).insert({ id, user_id: user.id, name: n });
      if (error) throw errFromSupabase(error, "Could not create item.");
      return { id, success: true };
    },

    async dashboard(limit) {
      await requireUser();
      const lim = Math.min(Math.max(parseInt(limit, 10) || 2000, 1), 2000);
      const { data, error } = await supabase
        .from(EXPENSES)
        .select(
          "id,name,item_id,item_name,price,quantity,expense_date,cuotas,referencia,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(lim);
      if (error) throw errFromSupabase(error, "Dashboard query failed.");
      const rows = (data || []).map(mapExpenseRow);
      const dashRows = rows.map((r) => ({
        itemName: r.itemName,
        price: r.price,
        quantity: r.quantity,
        expenseDate: r.expenseDate,
        createdDate: r.createdDate,
      }));
      return buildDashboardAggregates(dashRows, lim);
    },

    async exportAll() {
      await requireUser();
      const { data: items, error: e1 } = await supabase
        .from(ITEMS)
        .select("id,name")
        .order("name", { ascending: true });
      if (e1) throw errFromSupabase(e1, "Export failed (items).");
      const { data: expenses, error: e2 } = await supabase
        .from(EXPENSES)
        .select(
          "id,name,item_id,item_name,price,quantity,expense_date,cuotas,referencia,created_at"
        )
        .order("created_at", { ascending: false });
      if (e2) throw errFromSupabase(e2, "Export failed (expenses).");
      const outItems = (items || []).map((r) => ({ id: r.id, name: r.name }));
      const outExpenses = (expenses || []).map(mapExpenseRow);
      return JSON.stringify(
        {
          items: outItems,
          expenses: outExpenses,
          exportedAt: new Date().toISOString(),
          source: "supabase",
        },
        null,
        2
      );
    },

    async importAll(jsonText) {
      const user = await requireUser();
      const o = JSON.parse(jsonText);
      if (!o || !Array.isArray(o.items) || !Array.isArray(o.expenses)) {
        throw new Error("Invalid backup format");
      }
      const { error: d1 } = await supabase.from(EXPENSES).delete().neq("id", "");
      if (d1) throw errFromSupabase(d1, "Clear expenses failed.");
      const { error: d2 } = await supabase.from(ITEMS).delete().neq("id", "");
      if (d2) throw errFromSupabase(d2, "Clear items failed.");
      const itemRows = o.items.map((it) => ({
        id: String(it.id),
        user_id: user.id,
        name: String(it.name || ""),
      }));
      const expenseRows = o.expenses.map((r) => ({
        id: String(r.id),
        user_id: user.id,
        name: r.name != null ? String(r.name) : null,
        item_id: String(r.itemId || r.item_id || ""),
        item_name: r.itemName != null ? String(r.itemName) : r.item_name != null ? String(r.item_name) : null,
        price: r.price != null ? Number(r.price) : null,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        expense_date: r.expenseDate || r.expense_date || null,
        cuotas: r.cuotas != null ? parseInt(r.cuotas, 10) : null,
        referencia: r.referencia != null ? String(r.referencia) : null,
        created_at: r.createdDate || r.created_at || new Date().toISOString(),
      }));
      await insertChunks(ITEMS, itemRows);
      await insertChunks(EXPENSES, expenseRows);
      return { success: true };
    },
  };
}
