/**
 * Shared Salesforce REST auth (no extra npm deps).
 *
 * Recommended: External Client App + OAuth Client Credentials
 *   Setup → External Client Apps → create app → API (OAuth) → enable Client Credentials.
 *   Assign an access policy (run-as integration user with Query Item__c + Create Expense_Item_Price__c).
 *   Env:
 *     SF_CLIENT_ID       Consumer Key from the app (Settings → Consumer Key and Secret)
 *     SF_CLIENT_SECRET   Consumer Secret
 *     SF_LOGIN_URL       https://login.salesforce.com or https://test.salesforce.com (sandbox)
 *   Optional:
 *     SF_INSTANCE_URL    REST host; if omitted, uses instance_url from the token response when present
 *     SF_TOKEN_URL         Override token endpoint (default: SF_LOGIN_URL + /services/oauth2/token)
 *     SF_AUTH_MODE         client_credentials | jwt | auto (default auto: uses CC if SF_CLIENT_SECRET set)
 *
 * Optional legacy: Connected App JWT Bearer (no client secret)
 *     SF_CLIENT_ID, SF_USER, SF_PRIVATE_KEY, SF_LOGIN_URL
 *     SF_INSTANCE_URL required if token response has no instance_url
 *
 *   SF_API_VERSION (optional, default 60.0)
 *   ALLOWED_ORIGIN — see lib/http-helpers.js
 */

const crypto = require("crypto");
const https = require("https");
const { URL } = require("url");

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function buildJwtAssertion() {
  const loginUrl = (process.env.SF_LOGIN_URL || "https://login.salesforce.com").replace(/\/$/, "");
  const clientId = process.env.SF_CLIENT_ID;
  const username = process.env.SF_USER;
  let privateKey = process.env.SF_PRIVATE_KEY || "";
  if (!clientId || !username || !privateKey) {
    throw new Error("JWT: missing SF_CLIENT_ID, SF_USER, or SF_PRIVATE_KEY");
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  const header = { alg: "RS256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientId,
    sub: username,
    aud: loginUrl,
    exp: now + 3 * 60,
  };

  const encHeader = base64url(JSON.stringify(header));
  const encClaims = base64url(JSON.stringify(claims));
  const signInput = `${encHeader}.${encClaims}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = base64url(sign.sign(privateKey));
  return `${signInput}.${signature}`;
}

let tokenCache = {
  token: null,
  exp: 0,
  /** From last token response when SF_INSTANCE_URL not set */
  instanceFromToken: null,
};

function tokenEndpoint() {
  const custom = (process.env.SF_TOKEN_URL || "").trim();
  if (custom) return custom.replace(/\/$/, "");
  const loginUrl = (process.env.SF_LOGIN_URL || "https://login.salesforce.com").replace(/\/$/, "");
  return `${loginUrl}/services/oauth2/token`;
}

function authMode() {
  const explicit = (process.env.SF_AUTH_MODE || "auto").toLowerCase().trim();
  if (explicit === "client_credentials" || explicit === "jwt") return explicit;
  const hasSecret = !!(process.env.SF_CLIENT_SECRET && String(process.env.SF_CLIENT_SECRET).trim());
  if (hasSecret) return "client_credentials";
  return "jwt";
}

async function fetchToken(bodyParams) {
  const url = tokenEndpoint();
  const body = new URLSearchParams(bodyParams).toString();
  const res = await httpsRequest(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  if (res.status !== 200) {
    throw new Error(`Token error ${res.status}: ${res.body}`);
  }
  const json = JSON.parse(res.body);
  if (!json.access_token) {
    throw new Error("No access_token in response");
  }
  return json;
}

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.exp > now + 5000) {
    return tokenCache.token;
  }

  const mode = authMode();
  let json;

  if (mode === "client_credentials") {
    const clientId = process.env.SF_CLIENT_ID;
    const clientSecret = (process.env.SF_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
      throw new Error("Client Credentials: set SF_CLIENT_ID and SF_CLIENT_SECRET (External Client App)");
    }
    json = await fetchToken({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });
  } else {
    const assertion = buildJwtAssertion();
    json = await fetchToken({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    });
  }

  const ttl = (json.expires_in ? json.expires_in : 120) * 1000;
  let inst = (json.instance_url || "").replace(/\/$/, "") || null;
  tokenCache = {
    token: json.access_token,
    exp: now + ttl - 10000,
    instanceFromToken: inst,
  };
  return json.access_token;
}

function instanceUrl() {
  const envUrl = (process.env.SF_INSTANCE_URL || "").replace(/\/$/, "");
  if (envUrl) return envUrl;
  if (tokenCache.instanceFromToken) return tokenCache.instanceFromToken;
  throw new Error(
    "SF_INSTANCE_URL not set and token response had no instance_url; set SF_INSTANCE_URL to your org REST host (e.g. https://mydomain.my.salesforce.com)"
  );
}

function apiVersion() {
  return process.env.SF_API_VERSION || "60.0";
}

/** Escape a string for use inside SOQL single-quoted literal. */
function escapeSoqlString(s) {
  if (s == null) return "";
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function sfRestRequest(method, pathWithLeadingSlash, jsonBody) {
  const token = await getAccessToken();
  const base = instanceUrl();
  const url = `${base}/services/data/v${apiVersion()}${pathWithLeadingSlash}`;
  const headers = {
    Authorization: `Bearer ${token}`,
  };
  let body;
  if (jsonBody !== undefined) {
    body = typeof jsonBody === "string" ? jsonBody : JSON.stringify(jsonBody);
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(body);
  }
  return httpsRequest(url, { method, headers }, body);
}

/** Salesforce Id: 15 or 18 alphanumeric */
function isValidSalesforceId(id) {
  if (!id || typeof id !== "string") return false;
  return /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id.trim());
}

module.exports = {
  getAccessToken,
  httpsRequest,
  instanceUrl,
  apiVersion,
  escapeSoqlString,
  sfRestRequest,
  isValidSalesforceId,
};
