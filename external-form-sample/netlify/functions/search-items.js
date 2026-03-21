/**
 * Typeahead: runs SOQL against Item__c (Read permission on integration user).
 * POST JSON { "q": "partial name", "limit": 20 } or GET ?q=&limit=
 */

const { sfRestRequest, escapeSoqlString } = require("./lib/sf-client");
const { clientIp, allowRequest, json, corsHeaders } = require("./lib/http-helpers");

/** Safe API name for SOQL FROM (default Item__c). Override with env SF_ITEM_OBJECT if your object differs. */
function itemObjectApiName() {
  const raw = (process.env.SF_ITEM_OBJECT || "Item__c").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(raw)) {
    throw new Error("Invalid SF_ITEM_OBJECT");
  }
  return raw;
}

function buildQuery(term, limit) {
  const objectName = itemObjectApiName();
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const raw = String(term || "").trim();
  if (!raw) {
    return `SELECT Id, Name FROM ${objectName} ORDER BY Name LIMIT ${lim}`;
  }
  const noWild = raw.replace(/[%_\\]/g, "");
  const pattern = "%" + noWild + "%";
  const literal = escapeSoqlString(pattern);
  return `SELECT Id, Name FROM ${objectName} WHERE Name LIKE '${literal}' ORDER BY Name LIMIT ${lim}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(event), body: "" };
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return json(405, event, { error: "Method not allowed" });
  }

  const ip = clientIp(event);
  if (!allowRequest(ip, "search")) {
    return json(429, event, { error: "Too many requests. Try again in a minute." });
  }

  let q = "";
  let limit = 20;
  if (event.httpMethod === "GET") {
    const sp = event.queryStringParameters || {};
    q = sp.q || "";
    limit = sp.limit || 20;
  } else {
    try {
      const body = JSON.parse(event.body || "{}");
      q = body.q || "";
      limit = body.limit || 20;
    } catch {
      return json(400, event, { error: "Invalid JSON" });
    }
  }

  const soql = buildQuery(q, limit);
  const enc = encodeURIComponent(soql);
  try {
    const res = await sfRestRequest("GET", `/query?q=${enc}`);
    let data;
    try {
      data = JSON.parse(res.body);
    } catch {
      return json(502, event, {
        error: "Salesforce returned non-JSON (check SF_INSTANCE_URL and auth)",
        hint: String(res.body).slice(0, 200),
      });
    }
    if (res.status !== 200) {
      return json(res.status >= 400 ? res.status : 502, event, {
        error: "Salesforce query failed",
        details: data,
      });
    }
    const records = (data.records || []).map((r) => ({
      id: r.Id,
      name: r.Name,
    }));
    return json(200, event, { records });
  } catch (e) {
    console.error(e);
    return json(500, event, { error: e.message || "Server error" });
  }
};
