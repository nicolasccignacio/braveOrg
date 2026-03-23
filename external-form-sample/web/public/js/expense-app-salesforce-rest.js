/**
 * Expense UI backed by Salesforce standard REST Data API (query + sObject CRUD).
 * Objects: Item__c, Expense_Item_Price__c (must match your org).
 */
(function () {
  var ITEM_OBJECT = "Item__c";
  var EXPENSE_OBJECT = "Expense_Item_Price__c";

  function isValidSfId(id) {
    return typeof id === "string" && /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(id.trim());
  }

  function soqlStringLiteral(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/'/g, "''");
  }

  function monthKey(expenseDate, createdDate) {
    var ed = expenseDate != null ? String(expenseDate) : "";
    if (ed.length >= 7 && /^\d{4}-\d{2}/.test(ed)) return ed.slice(0, 7);
    var cd = createdDate != null ? String(createdDate) : "";
    if (cd.length >= 7 && /^\d{4}-\d{2}/.test(cd)) return cd.slice(0, 10).slice(0, 7);
    return "unknown";
  }

  function monthLabel(key) {
    if (key === "unknown") return "Unknown date";
    var parts = key.split("-");
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
    return new Date(y, m - 1, 1).toLocaleString("en", { month: "short", year: "numeric" });
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

  function mapExpenseRecord(rec) {
    var itemName = "—";
    if (rec.Item__r && rec.Item__r.Name != null) itemName = String(rec.Item__r.Name);
    return {
      id: rec.Id,
      name: rec.Name != null ? String(rec.Name) : rec.Id,
      itemId: rec.Item__c,
      itemName: itemName,
      price: rec.Price__c,
      quantity: rec.Quantity__c,
      expenseDate: rec.Expense_Date__c != null ? String(rec.Expense_Date__c).slice(0, 10) : null,
      cuotas: rec.Cuotas__c,
      referencia: rec.Referencia__c,
      createdDate: rec.CreatedDate,
    };
  }

  function mapExpenseForExport(rec) {
    var row = mapExpenseRecord(rec);
    return {
      id: row.id,
      name: row.name,
      itemId: row.itemId,
      itemName: row.itemName,
      price: row.price,
      quantity: row.quantity,
      expenseDate: row.expenseDate,
      cuotas: row.cuotas,
      referencia: row.referencia,
      createdDate: row.createdDate,
    };
  }

  async function ensureAccessToken() {
    var s = window.SFExpenseSession;
    if (!s.isSignedIn()) throw new Error("Connect to Salesforce first.");
    var exp = s.getExpiresAt();
    if (exp && Date.now() > exp && s.getRefreshToken()) {
      await s.refreshAccessToken();
    }
  }

  function parseRestError(text, status) {
    try {
      var j = JSON.parse(text);
      if (Array.isArray(j) && j[0] && j[0].message) return j[0].message;
      if (j && j.length && j[0].message) return j[0].message;
      if (j.message) return j.message;
      if (j.error_description) return j.error_description;
    } catch (e) {}
    return text || "HTTP " + status;
  }

  async function apiFetch(path, init) {
    init = init || {};
    await ensureAccessToken();
    var s = window.SFExpenseSession;
    var inst = s.getInstanceUrl();
    var token = s.getAccessToken();
    var ver = s.getApiVersion();
    var url = path.indexOf("http") === 0 ? path : inst + path;

    var headers = Object.assign({ Authorization: "Bearer " + token }, init.headers || {});
    if (init.body && typeof init.body === "string" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    var res = await fetch(url, Object.assign({}, init, { headers: headers }));

    if (res.status === 401 && s.getRefreshToken()) {
      await s.refreshAccessToken();
      headers.Authorization = "Bearer " + s.getAccessToken();
      res = await fetch(url, Object.assign({}, init, { headers: headers }));
    }

    var text = await res.text();
    if (!res.ok) {
      throw new Error(parseRestError(text, res.status));
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }

  async function query(soql) {
    var ver = window.SFExpenseSession.getApiVersion();
    var path = "/services/data/" + ver + "/query?q=" + encodeURIComponent(soql);
    return apiFetch(path, { method: "GET" });
  }

  async function queryAll(soql) {
    var ver = window.SFExpenseSession.getApiVersion();
    var inst = window.SFExpenseSession.getInstanceUrl();
    var all = [];
    var path = "/services/data/" + ver + "/query?q=" + encodeURIComponent(soql);
    var guard = 0;
    while (path && guard < 40) {
      guard++;
      var data = await apiFetch(path, { method: "GET" });
      if (!data || !Array.isArray(data.records)) break;
      all = all.concat(data.records);
      if (data.done || !data.nextRecordsUrl) break;
      path = data.nextRecordsUrl.indexOf("http") === 0 ? data.nextRecordsUrl : inst + data.nextRecordsUrl;
    }
    return all;
  }

  window.ExpenseAppSalesforce = {
    usesSalesforceBackend: function () {
      return true;
    },

    usesSupabaseBackend: function () {
      return false;
    },

    searchItems: async function (q, limit) {
      var raw = String(q || "").trim();
      var lim = Math.min(Math.max(parseInt(limit, 10) || (raw ? 50 : 2000), 1), 2000);
      var soql;
      if (!raw) {
        soql =
          "SELECT Id, Name FROM " +
          ITEM_OBJECT +
          " ORDER BY Name ASC NULLS LAST LIMIT " +
          lim;
      } else {
        var inner = soqlStringLiteral(raw);
        soql =
          "SELECT Id, Name FROM " +
          ITEM_OBJECT +
          " WHERE Name LIKE '%" +
          inner +
          "%' ORDER BY Name ASC NULLS LAST LIMIT " +
          lim;
      }
      var data = await query(soql);
      var rows = (data && data.records) || [];
      return {
        records: rows.map(function (r) {
          return { id: r.Id, name: r.Name };
        }),
      };
    },

    listHistory: async function (limit) {
      var lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      var soql =
        "SELECT Id, Name, Item__c, Item__r.Name, Price__c, Quantity__c, Expense_Date__c, Cuotas__c, Referencia__c, CreatedDate " +
        "FROM " +
        EXPENSE_OBJECT +
        " ORDER BY CreatedDate DESC LIMIT " +
        lim;
      var data = await query(soql);
      var rows = (data && data.records) || [];
      return { records: rows.map(mapExpenseRecord) };
    },

    submitExpense: async function (payload) {
      if (payload.website != null && String(payload.website).trim() !== "") {
        return Promise.reject(new Error("Invalid request"));
      }
      var itemId = String(payload.itemId || "").trim();
      if (!itemId || !isValidSfId(itemId)) {
        return Promise.reject(new Error("Select a valid item from search."));
      }
      var ver = window.SFExpenseSession.getApiVersion();
      var body = {
        Item__c: itemId,
        Price__c:
          payload.price != null && payload.price !== "" ? Number(payload.price) : null,
        Quantity__c:
          payload.quantity != null && payload.quantity !== "" ? Number(payload.quantity) : 1,
        Expense_Date__c: payload.expenseDate || null,
        Cuotas__c:
          payload.cuotas != null && payload.cuotas !== "" ? parseInt(payload.cuotas, 10) : null,
        Referencia__c:
          payload.referencia != null && String(payload.referencia).trim() !== ""
            ? String(payload.referencia).trim()
            : null,
      };
      var path = "/services/data/" + ver + "/sobjects/" + EXPENSE_OBJECT + "/";
      var res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      if (!res || !res.id) throw new Error("Create failed.");
      return { id: res.id, success: true };
    },

    updateExpense: async function (payload) {
      if (payload.website != null && String(payload.website).trim() !== "") {
        return Promise.reject(new Error("Invalid request"));
      }
      var recordId = String(payload.recordId || payload.id || "").trim();
      if (!recordId || !isValidSfId(recordId)) {
        return Promise.reject(new Error("recordId is required"));
      }
      var itemId = String(payload.itemId || "").trim();
      if (!itemId || !isValidSfId(itemId)) {
        return Promise.reject(new Error("Select a valid item."));
      }
      var ver = window.SFExpenseSession.getApiVersion();
      var patch = {
        Item__c: itemId,
        Price__c:
          payload.price != null && payload.price !== "" ? Number(payload.price) : null,
        Quantity__c:
          payload.quantity != null && payload.quantity !== "" ? Number(payload.quantity) : null,
        Expense_Date__c: payload.expenseDate || null,
        Cuotas__c:
          payload.cuotas != null && payload.cuotas !== "" ? parseInt(payload.cuotas, 10) : null,
        Referencia__c:
          payload.referencia != null ? String(payload.referencia).trim() || null : null,
      };
      var path =
        "/services/data/" + ver + "/sobjects/" + EXPENSE_OBJECT + "/" + encodeURIComponent(recordId);
      await apiFetch(path, { method: "PATCH", body: JSON.stringify(patch) });
      return { success: true };
    },

    deleteExpense: async function (payload) {
      if (payload.website != null && String(payload.website).trim() !== "") {
        return Promise.reject(new Error("Invalid request"));
      }
      var recordId = String(payload.recordId || payload.id || "").trim();
      if (!recordId || !isValidSfId(recordId)) {
        return Promise.reject(new Error("recordId is required"));
      }
      var ver = window.SFExpenseSession.getApiVersion();
      var path =
        "/services/data/" + ver + "/sobjects/" + EXPENSE_OBJECT + "/" + encodeURIComponent(recordId);
      await apiFetch(path, { method: "DELETE" });
      return { success: true };
    },

    createItem: async function (name) {
      var n = String(name || "").trim();
      if (!n) return Promise.reject(new Error("name is required"));
      var ver = window.SFExpenseSession.getApiVersion();
      var path = "/services/data/" + ver + "/sobjects/" + ITEM_OBJECT + "/";
      var body = { Name: n };
      var res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      if (!res || !res.id) throw new Error("Could not create item.");
      return { id: res.id, success: true };
    },

    dashboard: async function (limit) {
      var lim = Math.min(Math.max(parseInt(limit, 10) || 2000, 1), 2000);
      var soql =
        "SELECT Id, Name, Item__c, Item__r.Name, Price__c, Quantity__c, Expense_Date__c, Cuotas__c, Referencia__c, CreatedDate " +
        "FROM " +
        EXPENSE_OBJECT +
        " ORDER BY CreatedDate DESC LIMIT " +
        lim;
      var data = await query(soql);
      var rows = ((data && data.records) || []).map(mapExpenseRecord);
      var dashRows = rows.map(function (r) {
        return {
          itemName: r.itemName,
          price: r.price,
          quantity: r.quantity,
          expenseDate: r.expenseDate,
          createdDate: r.createdDate,
        };
      });
      return buildDashboardAggregates(dashRows, lim);
    },

    exportAll: async function () {
      var itemRows = await queryAll("SELECT Id, Name FROM " + ITEM_OBJECT + " ORDER BY Name");
      var expRows = await queryAll(
        "SELECT Id, Name, Item__c, Item__r.Name, Price__c, Quantity__c, Expense_Date__c, Cuotas__c, Referencia__c, CreatedDate FROM " +
          EXPENSE_OBJECT +
          " ORDER BY CreatedDate DESC"
      );
      var items = itemRows.map(function (r) {
        return { id: r.Id, name: r.Name };
      });
      var expenses = expRows.map(mapExpenseForExport);
      return JSON.stringify(
        { items: items, expenses: expenses, exportedAt: new Date().toISOString(), source: "salesforce" },
        null,
        2
      );
    },

    importAll: function () {
      return Promise.reject(
        new Error("Import is disabled in Salesforce mode. Switch to browser-only or use Data Loader.")
      );
    },
  };
})();
