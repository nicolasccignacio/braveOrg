/**
 * Item list / search: SOQL on SF_ITEM_OBJECT (default Item__c).
 * Empty q: list up to 2000 rows (page load). With q: name LIKE, up to MAX_SEARCH rows.
 */

const { sfRestRequest, escapeSoqlString } = require("./lib/sf-client");
const { itemObjectApiName } = require("./lib/sf-objects");
const { clientIp, allowRequest, json, corsHeaders } = require("./lib/http-helpers");

const MAX_LIST = 2000;
/** With a search term, allow more rows for autocomplete-style UIs. */
const MAX_SEARCH = 150;

function buildQuery(term, limitParam) {
  const objectName = itemObjectApiName();
  const raw = String(term || "").trim();
  const parsed = parseInt(limitParam, 10);
  const hasFilter = !!raw;
  const maxLim = hasFilter ? MAX_SEARCH : MAX_LIST;
  const defaultLim = hasFilter ? 50 : MAX_LIST;
  const lim = Math.min(
    Math.max(Number.isFinite(parsed) && parsed > 0 ? parsed : defaultLim, 1),
    maxLim
  );
  if (!hasFilter) {
    return `SELECT Id, Name FROM ${objectName} ORDER BY Name LIMIT ${lim}`;
  }
  const noWild = raw.replace(/[%_\\]/g, "");
  const pattern = "%" + noWild + "%";
  const literal = escapeSoqlString(pattern);
  return `SELECT Id, Name FROM ${objectName} WHERE Name LIKE '${literal}' ORDER BY Name LIMIT ${lim}`;
}

exports.handler = async (event) => {
  try {
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
    const rows = Array.isArray(data.records) ? data.records : [];
    const records = rows.map((r) => ({
      id: r.Id,
      name: r.Name,
    }));
    return json(200, event, { records });
  } catch (e) {
    console.error("search-items", e);
    return json(500, event, {
      error: e.message || "Server error",
      hint:
        "Check Netlify env: SF_CLIENT_ID, SF_CLIENT_SECRET, SF_INSTANCE_URL (or SF_TOKEN_URL). Open function response JSON in browser DevTools → Network.",
    });
  }
};
