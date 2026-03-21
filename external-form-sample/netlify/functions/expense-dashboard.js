/**
 * Aggregated expense stats for charts (same object/fields as list-history).
 * GET ?limit=500  (max 2000) — sums price × quantity, groups by month and item.
 */

const { sfRestRequest } = require("./lib/sf-client");
const { expenseObjectApiName } = require("./lib/sf-objects");
const { clientIp, allowRequest, json, corsHeaders } = require("./lib/http-helpers");

function lineAmount(price, quantity) {
  const p = parseFloat(price);
  const q = parseFloat(quantity);
  if (!Number.isFinite(p) || !Number.isFinite(q)) return 0;
  return p * q;
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
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("en", { month: "short", year: "numeric" });
}

function buildAggregates(records) {
  const monthMap = new Map();
  const itemMap = new Map();
  let amountSum = 0;

  records.forEach((r) => {
    const amt = lineAmount(r.price, r.quantity);
    amountSum += amt;

    const mk = monthKey(r.expenseDate, r.createdDate);
    monthMap.set(mk, (monthMap.get(mk) || 0) + amt);

    const nm =
      r.itemName != null && String(r.itemName).trim() !== ""
        ? String(r.itemName).trim()
        : "—";
    const prev = itemMap.get(nm) || { total: 0, count: 0 };
    prev.total += amt;
    prev.count += 1;
    itemMap.set(nm, prev);
  });

  const byMonth = Array.from(monthMap.entries())
    .map(([key, total]) => ({
      key,
      label: monthLabel(key),
      total: Math.round(total * 100) / 100,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const byItem = Array.from(itemMap.entries())
    .map(([name, v]) => ({
      name,
      total: Math.round(v.total * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  return {
    totals: {
      expenseCount: records.length,
      amountSum: Math.round(amountSum * 100) / 100,
    },
    byMonth,
    byItem,
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders(event), body: "" };
    }

    if (event.httpMethod !== "GET") {
      return json(405, event, { error: "Method not allowed" });
    }

    const ip = clientIp(event);
    if (!allowRequest(ip, "search")) {
      return json(429, event, { error: "Too many requests. Try again in a minute." });
    }

    const sp = event.queryStringParameters || {};
    const lim = Math.min(Math.max(parseInt(sp.limit, 10) || 500, 1), 2000);
    const exp = expenseObjectApiName();

    const soql = `SELECT Id, Item__r.Name, Price__c, Quantity__c, Expense_Date__c, CreatedDate FROM ${exp} ORDER BY CreatedDate DESC LIMIT ${lim}`;
    const enc = encodeURIComponent(soql);
    const res = await sfRestRequest("GET", `/query?q=${enc}`);

    let data;
    try {
      data = JSON.parse(res.body);
    } catch {
      return json(502, event, {
        error: "Salesforce returned non-JSON",
        hint: String(res.body).slice(0, 200),
      });
    }

    if (res.status !== 200) {
      return json(res.status >= 400 ? res.status : 502, event, {
        error: "Salesforce query failed",
        details: data,
      });
    }

    const rows = Array.isArray(data.records) ? data.records : [];
    const records = rows.map((r) => ({
      itemName: r.Item__r && r.Item__r.Name != null ? r.Item__r.Name : "",
      price: r.Price__c,
      quantity: r.Quantity__c,
      expenseDate: r.Expense_Date__c,
      createdDate: r.CreatedDate,
    }));

    const agg = buildAggregates(records);

    return json(200, event, {
      ...agg,
      meta: {
        queryLimit: lim,
        recordCount: records.length,
      },
    });
  } catch (e) {
    console.error("expense-dashboard", e);
    return json(500, event, { error: e.message || "Server error" });
  }
};
