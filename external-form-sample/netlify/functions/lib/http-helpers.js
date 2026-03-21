/**
 * CORS + client IP + light rate limit (best-effort per warm lambda).
 */

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_SEARCH = 40;
const RATE_MAX_SUBMIT = 15;
const hitBuckets = new Map();

function clientIp(event) {
  const xff = event.headers["x-forwarded-for"] || event.headers["X-Forwarded-For"];
  if (xff) return String(xff).split(",")[0].trim();
  return event.headers["client-ip"] || event.headers["Client-Ip"] || "unknown";
}

function allowRequest(ip, kind) {
  const max = kind === "submit" ? RATE_MAX_SUBMIT : RATE_MAX_SEARCH;
  const now = Date.now();
  const key = `${kind}:${ip}`;
  let b = hitBuckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  b.count += 1;
  hitBuckets.set(key, b);
  if (hitBuckets.size > 5000) {
    for (const [k, v] of hitBuckets) {
      if (now > v.resetAt) hitBuckets.delete(k);
    }
  }
  return b.count <= max;
}

function corsHeaders(event) {
  const allowed = process.env.ALLOWED_ORIGIN;
  const origin = event.headers.origin || event.headers.Origin;
  let allow = false;
  let header = "";
  if (!allowed || allowed === "*") {
    allow = true;
    header = origin || "*";
  } else {
    const list = allowed.split(",").map((s) => s.trim());
    if (origin && list.includes(origin)) {
      allow = true;
      header = origin;
    }
  }
  const h = {
    "Content-Type": "application/json",
  };
  if (allow) {
    h["Access-Control-Allow-Origin"] = header;
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  }
  return h;
}

function json(statusCode, event, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...corsHeaders(event), ...extraHeaders },
    body: JSON.stringify(bodyObj),
  };
}

module.exports = {
  clientIp,
  allowRequest,
  corsHeaders,
  json,
};
