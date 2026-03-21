/**
 * PATCH expense record (SF_EXPENSE_OBJECT). POST JSON same fields as submit-expense + recordId.
 */

const { sfRestRequest, isValidSalesforceId } = require("./lib/sf-client");
const { expenseObjectApiName } = require("./lib/sf-objects");
const { clientIp, allowRequest, json, corsHeaders } = require("./lib/http-helpers");

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders(event), body: "" };
    }

    if (event.httpMethod !== "POST") {
      return json(405, event, { error: "Method not allowed" });
    }

    const ip = clientIp(event);
    if (!allowRequest(ip, "submit")) {
      return json(429, event, { error: "Too many requests. Try again in a minute." });
    }

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return json(400, event, { error: "Invalid JSON" });
    }

    if (payload.website != null && String(payload.website).trim() !== "") {
      return json(400, event, { error: "Invalid request" });
    }

    const recordId = String(payload.recordId || payload.id || "").trim();
    if (!recordId || !isValidSalesforceId(recordId)) {
      return json(400, event, { error: "recordId is required" });
    }

    const itemId = (payload.itemId || "").trim();
    if (!itemId || !isValidSalesforceId(itemId)) {
      return json(400, event, { error: "Select a valid item." });
    }

    const { price, quantity, expenseDate, cuotas, referencia } = payload;

    const sobject = {
      Item__c: itemId,
      Price__c: price != null && price !== "" ? Number(price) : undefined,
      Quantity__c: quantity != null && quantity !== "" ? Number(quantity) : undefined,
      Expense_Date__c: expenseDate || undefined,
      Cuotas__c: cuotas != null && cuotas !== "" ? Number(cuotas) : undefined,
      Referencia__c: referencia != null && String(referencia).trim() !== "" ? String(referencia).trim() : undefined,
    };

    Object.keys(sobject).forEach((k) => {
      if (sobject[k] === undefined) delete sobject[k];
    });

    const numFields = ["Price__c", "Quantity__c", "Cuotas__c"];
    for (const f of numFields) {
      if (sobject[f] !== undefined && Number.isNaN(sobject[f])) {
        return json(400, event, { error: `Invalid number for ${f}` });
      }
    }

    const exp = expenseObjectApiName();
    const path = `/sobjects/${exp}/${recordId}`;
    const res = await sfRestRequest("PATCH", path, sobject);

    if (res.status === 204) {
      return json(200, event, { success: true });
    }

    let data = {};
    if (res.body && String(res.body).trim()) {
      try {
        data = JSON.parse(res.body);
      } catch {
        return json(502, event, { error: "Salesforce returned non-JSON", hint: String(res.body).slice(0, 200) });
      }
    }

    if (res.status >= 200 && res.status < 300) {
      return json(200, event, { success: true });
    }

    return json(res.status >= 400 ? res.status : 502, event, {
      error: "Salesforce API error",
      details: data,
    });
  } catch (e) {
    console.error("update-expense", e);
    return json(500, event, { error: e.message || "Server error" });
  }
};
