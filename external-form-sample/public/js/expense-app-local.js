/**
 * GitHub Pages–friendly storage: items + expenses in localStorage (no server).
 * IDs are 15-char alphanumeric (Salesforce-shaped) for compatibility with existing form logic.
 */
(function () {
  var KEYS = { items: "expenseApp_local_items_v1", expenses: "expenseApp_local_expenses_v1" };

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return Array.isArray(v) ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, arr) {
    localStorage.setItem(key, JSON.stringify(arr));
  }

  function genSfLikeId() {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
    var s = "";
    for (var i = 0; i < 15; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  function isValidId(id) {
    return typeof id === "string" && /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id.trim());
  }

  function getItems() {
    return readJson(KEYS.items, []);
  }

  function getExpenses() {
    return readJson(KEYS.expenses, []);
  }

  function monthKey(expenseDate, createdDate) {
    var ed = expenseDate != null ? String(expenseDate) : "";
    if (ed.length >= 7 && /^\d{4}-\d{2}/.test(ed)) return ed.slice(0, 7);
    var cd = createdDate != null ? String(createdDate) : "";
    if (cd.length >= 7 && /^\d{4}-\d{2}/.test(cd)) return cd.slice(0, 7);
    return "unknown";
  }

  function monthLabel(key) {
    if (key === "unknown") return "Unknown date";
    var parts = key.split("-");
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
    var d = new Date(y, m - 1, 1);
    return d.toLocaleString("en", { month: "short", year: "numeric" });
  }

  function lineAmount(price, quantity) {
    var p = parseFloat(price);
    var q = parseFloat(quantity);
    if (!Number.isFinite(p) || !Number.isFinite(q)) return 0;
    return p * q;
  }

  function buildDashboardAggregates(records, lim) {
    var monthMap = {};
    var itemMap = {};
    var amountSum = 0;

    records.forEach(function (r) {
      var amt = lineAmount(r.price, r.quantity);
      amountSum += amt;
      var mk = monthKey(r.expenseDate, r.createdDate);
      monthMap[mk] = (monthMap[mk] || 0) + amt;
      var nm =
        r.itemName != null && String(r.itemName).trim() !== "" ? String(r.itemName).trim() : "—";
      var prev = itemMap[nm] || { total: 0, count: 0 };
      prev.total += amt;
      prev.count += 1;
      itemMap[nm] = prev;
    });

    var byMonth = Object.keys(monthMap)
      .map(function (key) {
        return {
          key: key,
          label: monthLabel(key),
          total: Math.round(monthMap[key] * 100) / 100,
        };
      })
      .sort(function (a, b) {
        return a.key.localeCompare(b.key);
      });

    var byItem = Object.keys(itemMap)
      .map(function (name) {
        var v = itemMap[name];
        return { name: name, total: Math.round(v.total * 100) / 100, count: v.count };
      })
      .sort(function (a, b) {
        return b.total - a.total;
      })
      .slice(0, 12);

    return {
      totals: {
        expenseCount: records.length,
        amountSum: Math.round(amountSum * 100) / 100,
      },
      byMonth: byMonth,
      byItem: byItem,
      meta: { queryLimit: lim, recordCount: records.length },
    };
  }

  window.ExpenseAppLocal = {
    searchItems: function (q, limit) {
      var items = getItems();
      var raw = String(q || "").trim();
      var lim = Math.min(Math.max(parseInt(limit, 10) || (raw ? 50 : 2000), 1), 2000);
      var list = items.slice().sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name));
      });
      if (raw) {
        var lower = raw.toLowerCase();
        list = list.filter(function (it) {
          return String(it.name).toLowerCase().indexOf(lower) >= 0;
        });
      }
      return Promise.resolve({ records: list.slice(0, lim) });
    },

    listHistory: function (limit) {
      var lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      var rows = getExpenses()
        .slice()
        .sort(function (a, b) {
          return String(b.createdDate).localeCompare(String(a.createdDate));
        })
        .slice(0, lim)
        .map(function (r) {
          return {
            id: r.id,
            name: r.name,
            itemId: r.itemId,
            itemName: r.itemName,
            price: r.price,
            quantity: r.quantity,
            expenseDate: r.expenseDate,
            cuotas: r.cuotas,
            referencia: r.referencia,
            createdDate: r.createdDate,
          };
        });
      return Promise.resolve({ records: rows });
    },

    submitExpense: function (payload) {
      if (payload.website != null && String(payload.website).trim() !== "") {
        return Promise.reject(new Error("Invalid request"));
      }
      var itemId = String(payload.itemId || "").trim();
      if (!itemId || !isValidId(itemId)) return Promise.reject(new Error("Select a valid item from search."));
      var items = getItems();
      var item = items.find(function (x) {
        return x.id === itemId;
      });
      if (!item) return Promise.reject(new Error("Item not found."));
      var id = genSfLikeId();
      var now = new Date().toISOString();
      var rec = {
        id: id,
        name: "EXP-" + id.slice(0, 8),
        itemId: itemId,
        itemName: item.name,
        price: payload.price != null && payload.price !== "" ? Number(payload.price) : null,
        quantity: payload.quantity != null && payload.quantity !== "" ? Number(payload.quantity) : null,
        expenseDate: payload.expenseDate || null,
        cuotas: payload.cuotas != null && payload.cuotas !== "" ? Number(payload.cuotas) : null,
        referencia: payload.referencia != null ? String(payload.referencia).trim() || null : null,
        createdDate: now,
      };
      var ex = getExpenses();
      ex.unshift(rec);
      writeJson(KEYS.expenses, ex);
      return Promise.resolve({ id: id, success: true });
    },

    updateExpense: function (payload) {
      if (payload.website != null && String(payload.website).trim() !== "") {
        return Promise.reject(new Error("Invalid request"));
      }
      var recordId = String(payload.recordId || payload.id || "").trim();
      if (!recordId || !isValidId(recordId)) return Promise.reject(new Error("recordId is required"));
      var itemId = String(payload.itemId || "").trim();
      if (!itemId || !isValidId(itemId)) return Promise.reject(new Error("Select a valid item."));
      var items = getItems();
      var item = items.find(function (x) {
        return x.id === itemId;
      });
      if (!item) return Promise.reject(new Error("Item not found."));
      var ex = getExpenses();
      var i = ex.findIndex(function (r) {
        return r.id === recordId;
      });
      if (i < 0) return Promise.reject(new Error("Record not found."));
      ex[i] = Object.assign({}, ex[i], {
        itemId: itemId,
        itemName: item.name,
        price: payload.price != null && payload.price !== "" ? Number(payload.price) : ex[i].price,
        quantity: payload.quantity != null && payload.quantity !== "" ? Number(payload.quantity) : ex[i].quantity,
        expenseDate: payload.expenseDate || ex[i].expenseDate,
        cuotas: payload.cuotas != null && payload.cuotas !== "" ? Number(payload.cuotas) : ex[i].cuotas,
        referencia:
          payload.referencia != null ? String(payload.referencia).trim() || null : ex[i].referencia,
      });
      writeJson(KEYS.expenses, ex);
      return Promise.resolve({ success: true });
    },

    deleteExpense: function (payload) {
      if (payload.website != null && String(payload.website).trim() !== "") {
        return Promise.reject(new Error("Invalid request"));
      }
      var recordId = String(payload.recordId || payload.id || "").trim();
      if (!recordId || !isValidId(recordId)) return Promise.reject(new Error("recordId is required"));
      var ex = getExpenses().filter(function (r) {
        return r.id !== recordId;
      });
      if (ex.length === getExpenses().length) return Promise.reject(new Error("Record not found."));
      writeJson(KEYS.expenses, ex);
      return Promise.resolve({ success: true });
    },

    createItem: function (name) {
      var n = String(name || "").trim();
      if (!n) return Promise.reject(new Error("name is required"));
      var items = getItems();
      var id = genSfLikeId();
      items.push({ id: id, name: n });
      items.sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name));
      });
      writeJson(KEYS.items, items);
      return Promise.resolve({ id: id, success: true });
    },

    dashboard: function (limit) {
      var lim = Math.min(Math.max(parseInt(limit, 10) || 2000, 1), 2000);
      var rows = getExpenses()
        .slice()
        .sort(function (a, b) {
          return String(b.createdDate).localeCompare(String(a.createdDate));
        })
        .slice(0, lim)
        .map(function (r) {
          return {
            itemName: r.itemName,
            price: r.price,
            quantity: r.quantity,
            expenseDate: r.expenseDate,
            createdDate: r.createdDate,
          };
        });
      var agg = buildDashboardAggregates(rows, lim);
      return Promise.resolve(agg);
    },

    exportAll: function () {
      return JSON.stringify({ items: getItems(), expenses: getExpenses(), exportedAt: new Date().toISOString() }, null, 2);
    },

    importAll: function (jsonText) {
      var o = JSON.parse(jsonText);
      if (!o || !Array.isArray(o.items) || !Array.isArray(o.expenses)) throw new Error("Invalid backup format");
      writeJson(KEYS.items, o.items);
      writeJson(KEYS.expenses, o.expenses);
      return Promise.resolve({ success: true });
    },
  };
})();
