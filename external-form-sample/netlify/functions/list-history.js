/**
 * Recent expense rows for SF_EXPENSE_OBJECT (default Expense_Item_Price__c).
 * GET ?limit=50
 */

const { sfRestRequest } = require("./lib/sf-client");
const { expenseObjectApiName } = require("./lib/sf-objects");
const { clientIp, allowRequest, json, corsHeaders } = require("./lib/http-helpers");

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
    const lim = Math.min(Math.max(parseInt(sp.limit, 10) || 50, 1), 200);
    const exp = expenseObjectApiName();

    const soql = `SELECT Id, Name, Item__c, Item__r.Name, Price__c, Quantity__c, Expense_Date__c, Cuotas__c, Referencia__c, CreatedDate FROM ${exp} ORDER BY CreatedDate DESC LIMIT ${lim}`;
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
      id: r.Id,
      name: r.Name,
      itemId: r.Item__c,
      itemName: r.Item__r && r.Item__r.Name != null ? r.Item__r.Name : "",
      price: r.Price__c,
      quantity: r.Quantity__c,
      expenseDate: r.Expense_Date__c,
      cuotas: r.Cuotas__c,
      referencia: r.Referencia__c,
      createdDate: r.CreatedDate,
    }));

    return json(200, event, { records });
  } catch (e) {
    console.error("list-history", e);
    return json(500, event, { error: e.message || "Server error" });
  }
};
