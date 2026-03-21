/**
 * DELETE expense row. POST JSON { "recordId": "..." } (+ empty website honeypot).
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

    const exp = expenseObjectApiName();
    const path = `/sobjects/${exp}/${recordId}`;
    const res = await sfRestRequest("DELETE", path);

    if (res.status === 204 || res.status === 200) {
      return json(200, event, { success: true });
    }

    let data = {};
    if (res.body && String(res.body).trim()) {
      try {
        data = JSON.parse(res.body);
      } catch {
        /* ignore */
      }
    }

    return json(res.status >= 400 ? res.status : 502, event, {
      error: "Could not delete",
      details: data,
    });
  } catch (e) {
    console.error("delete-expense", e);
    return json(500, event, { error: e.message || "Server error" });
  }
};
