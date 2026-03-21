/**
 * Creates one row on SF_ITEM_OBJECT (default Item__c) with Name.
 * POST JSON { "name": "Label" }
 */

const { sfRestRequest } = require("./lib/sf-client");
const { itemObjectApiName } = require("./lib/sf-objects");
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

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, event, { error: "Invalid JSON" });
    }

    const name = String(body.name || "").trim();
    if (!name) {
      return json(400, event, { error: "name is required" });
    }

    const obj = itemObjectApiName();
    const res = await sfRestRequest("POST", `/sobjects/${obj}/`, { Name: name });
    let data;
    try {
      data = JSON.parse(res.body);
    } catch {
      return json(502, event, { error: "Salesforce returned non-JSON", hint: String(res.body).slice(0, 200) });
    }

    if (res.status !== 201 && res.status !== 200) {
      return json(res.status >= 400 ? res.status : 502, event, {
        error: "Could not create item",
        details: data,
      });
    }

    return json(201, event, { id: data.id, success: true });
  } catch (e) {
    console.error("create-item", e);
    return json(500, event, { error: e.message || "Server error" });
  }
};
