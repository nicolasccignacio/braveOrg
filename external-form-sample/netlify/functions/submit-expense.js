/**
 * Creates Expense_Item_Price__c via Salesforce REST API.
 * Auth: External Client App (Client Credentials) by default — see lib/sf-client.js.
 *
 * Bot trap: include field "website" in JSON; must be empty (hidden in browser).
 */

const { sfRestRequest, isValidSalesforceId } = require("./lib/sf-client");
const { clientIp, allowRequest, json, corsHeaders } = require("./lib/http-helpers");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(event), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, event, { error: "Method not allowed" });
  }

  const ip = clientIp(event);
  if (!allowRequest(ip, "submit")) {
    return json(429, event, { error: "Too many submissions. Try again in a minute." });
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

  const itemId = (payload.itemId || "").trim();
  if (!itemId || !isValidSalesforceId(itemId)) {
    return json(400, event, { error: "Select a valid item from search." });
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

  try {
    const res = await sfRestRequest("POST", "/sobjects/Expense_Item_Price__c", sobject);
    let data;
    try {
      data = JSON.parse(res.body);
    } catch {
      data = { raw: res.body };
    }

    if (res.status !== 201 && res.status !== 200) {
      return json(res.status >= 400 ? res.status : 502, event, {
        error: "Salesforce API error",
        details: data,
      });
    }

    return json(201, event, { id: data.id, success: true });
  } catch (e) {
    console.error(e);
    return json(500, event, { error: e.message || "Server error" });
  }
};
