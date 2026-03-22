/**
 * OAuth 2.0 Authorization Code with PKCE for Salesforce User-Agent (public) apps.
 * Tokens live in sessionStorage; client id and login host in localStorage.
 */
(function () {
  var PREFIX = "expenseSf_";

  function storageKey(k) {
    return PREFIX + k;
  }

  function deployConfig() {
    var c = window.__EXPENSE_SF_CONFIG__;
    return c && typeof c === "object" ? c : {};
  }

  function strTrim(v) {
    return v != null ? String(v).trim() : "";
  }

  function genCodeVerifier() {
    var pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    var out = "";
    var a = new Uint8Array(64);
    crypto.getRandomValues(a);
    for (var i = 0; i < 64; i++) out += pool[a[i] % pool.length];
    return out;
  }

  function base64UrlEncode(buf) {
    var bytes = new Uint8Array(buf);
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function randomState() {
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return base64UrlEncode(a.buffer);
  }

  function getRedirectUri() {
    return window.location.href.split("#")[0].split("?")[0];
  }

  function normalizeLoginHost(h) {
    h = strTrim(h) || "https://login.salesforce.com";
    if (!/^https:\/\//i.test(h)) h = "https://" + h.replace(/^\/+/, "");
    return h.replace(/\/$/, "");
  }

  function parseStoredLoginHost() {
    var d = strTrim(deployConfig().loginHost);
    if (d) return normalizeLoginHost(d);
    return normalizeLoginHost(localStorage.getItem(storageKey("login_host")) || "");
  }

  window.SFExpenseSession = {
    /** True when this build has a Consumer Key (from deploy config or legacy localStorage). */
    hasOAuthClientConfigured: function () {
      var d = strTrim(deployConfig().clientId);
      if (d) return true;
      return !!strTrim(localStorage.getItem(storageKey("client_id")));
    },

    getLoginHost: function () {
      return parseStoredLoginHost();
    },

    setLoginHost: function (url) {
      var u = String(url || "").trim();
      if (u) localStorage.setItem(storageKey("login_host"), u.replace(/\/$/, ""));
    },

    getClientId: function () {
      var d = strTrim(deployConfig().clientId);
      if (d) return d;
      return strTrim(localStorage.getItem(storageKey("client_id")));
    },

    setClientId: function (id) {
      localStorage.setItem(storageKey("client_id"), String(id || "").trim());
    },

    getApiVersion: function () {
      var d = strTrim(deployConfig().apiVersion);
      var v = d || strTrim(localStorage.getItem(storageKey("api_version"))) || "v63.0";
      return v.indexOf("v") === 0 ? v : "v" + v;
    },

    setApiVersion: function (v) {
      var s = String(v || "").trim();
      if (s && !/^v\d/i.test(s)) s = "v" + s;
      if (s) localStorage.setItem(storageKey("api_version"), s);
    },

    clearBrowserOnlyPreference: function () {
      localStorage.removeItem(storageKey("force_browser"));
    },

    /** Clears Salesforce session and stays on local data until Connect is used again. */
    setBrowserOnlyMode: function () {
      this.clearSession();
      localStorage.setItem(storageKey("force_browser"), "1");
    },

    isForceBrowserOnly: function () {
      return localStorage.getItem(storageKey("force_browser")) === "1";
    },

    isSignedIn: function () {
      try {
        if (this.isForceBrowserOnly()) return false;
        return !!sessionStorage.getItem(storageKey("access_token")) && !!sessionStorage.getItem(storageKey("instance_url"));
      } catch (e) {
        return false;
      }
    },

    getAccessToken: function () {
      return sessionStorage.getItem(storageKey("access_token")) || "";
    },

    getRefreshToken: function () {
      return sessionStorage.getItem(storageKey("refresh_token")) || "";
    },

    getInstanceUrl: function () {
      return (sessionStorage.getItem(storageKey("instance_url")) || "").replace(/\/$/, "");
    },

    getExpiresAt: function () {
      var t = sessionStorage.getItem(storageKey("expires_at"));
      return t ? parseInt(t, 10) : 0;
    },

    clearSession: function () {
      try {
        sessionStorage.removeItem(storageKey("access_token"));
        sessionStorage.removeItem(storageKey("refresh_token"));
        sessionStorage.removeItem(storageKey("instance_url"));
        sessionStorage.removeItem(storageKey("expires_at"));
        sessionStorage.removeItem(storageKey("id_url"));
      } catch (e) {}
    },

    disconnect: function () {
      this.clearSession();
      localStorage.removeItem(storageKey("force_browser"));
    },

    beginOAuth: async function () {
      var clientId = this.getClientId();
      if (!clientId) {
        throw new Error(
          "Salesforce sign-in is not configured for this site. The operator must set repository variables (SF_CLIENT_ID, etc.) or ship sf-config.js with a Client ID."
        );
      }

      localStorage.removeItem(storageKey("force_browser"));

      var loginHost = this.getLoginHost();
      var verifier = genCodeVerifier();
      sessionStorage.setItem(storageKey("pkce_verifier"), verifier);
      var enc = new TextEncoder().encode(verifier);
      var digest = await crypto.subtle.digest("SHA-256", enc);
      var challenge = base64UrlEncode(digest);

      var state = randomState();
      sessionStorage.setItem(storageKey("oauth_state"), state);

      var redirect = getRedirectUri();
      var scope = encodeURIComponent("api refresh_token");
      var url =
        loginHost +
        "/services/oauth2/authorize?response_type=code&client_id=" +
        encodeURIComponent(clientId) +
        "&redirect_uri=" +
        encodeURIComponent(redirect) +
        "&scope=" +
        scope +
        "&code_challenge=" +
        encodeURIComponent(challenge) +
        "&code_challenge_method=S256&state=" +
        encodeURIComponent(state);

      window.location.assign(url);
    },

    exchangeCodeForTokens: async function (code) {
      var clientId = this.getClientId();
      var loginHost = this.getLoginHost();
      var redirect = getRedirectUri();
      var verifier = sessionStorage.getItem(storageKey("pkce_verifier")) || "";
      sessionStorage.removeItem(storageKey("pkce_verifier"));

      var body =
        "grant_type=authorization_code&code=" +
        encodeURIComponent(code) +
        "&client_id=" +
        encodeURIComponent(clientId) +
        "&redirect_uri=" +
        encodeURIComponent(redirect) +
        "&code_verifier=" +
        encodeURIComponent(verifier);

      var res = await fetch(loginHost + "/services/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body,
      });
      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        var msg = json.error_description || json.error || res.statusText || "Token exchange failed";
        throw new Error(String(msg));
      }

      sessionStorage.setItem(storageKey("access_token"), json.access_token);
      if (json.refresh_token) sessionStorage.setItem(storageKey("refresh_token"), json.refresh_token);
      sessionStorage.setItem(storageKey("instance_url"), String(json.instance_url || "").replace(/\/$/, ""));
      if (json.id) sessionStorage.setItem(storageKey("id_url"), json.id);
      var expiresIn = parseInt(json.expires_in, 10);
      if (Number.isFinite(expiresIn) && expiresIn > 0) {
        sessionStorage.setItem(storageKey("expires_at"), String(Date.now() + expiresIn * 1000 - 60000));
      } else {
        sessionStorage.removeItem(storageKey("expires_at"));
      }
      this.clearBrowserOnlyPreference();
    },

    refreshAccessToken: async function () {
      var refresh = this.getRefreshToken();
      var clientId = this.getClientId();
      if (!refresh || !clientId) throw new Error("No refresh token; connect again.");

      var loginHost = this.getLoginHost();
      var body =
        "grant_type=refresh_token&refresh_token=" +
        encodeURIComponent(refresh) +
        "&client_id=" +
        encodeURIComponent(clientId);

      var res = await fetch(loginHost + "/services/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body,
      });
      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        this.clearSession();
        var msg = json.error_description || json.error || "Session expired; connect again.";
        throw new Error(String(msg));
      }

      sessionStorage.setItem(storageKey("access_token"), json.access_token);
      if (json.refresh_token) sessionStorage.setItem(storageKey("refresh_token"), json.refresh_token);
      if (json.instance_url) sessionStorage.setItem(storageKey("instance_url"), String(json.instance_url).replace(/\/$/, ""));
      var expiresIn = parseInt(json.expires_in, 10);
      if (Number.isFinite(expiresIn) && expiresIn > 0) {
        sessionStorage.setItem(storageKey("expires_at"), String(Date.now() + expiresIn * 1000 - 60000));
      }
    },

    handleRedirectIfPresent: function () {
      var params = new URLSearchParams(window.location.search);
      var code = params.get("code");
      var state = params.get("state");
      var err = params.get("error");
      var errDesc = params.get("error_description");

      if (err) {
        var clean = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, clean);
        return Promise.reject(new Error(errDesc || err));
      }

      if (!code || !state) return Promise.resolve(false);

      var expected = sessionStorage.getItem(storageKey("oauth_state"));
      sessionStorage.removeItem(storageKey("oauth_state"));
      if (!expected || state !== expected) {
        var clean2 = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, clean2);
        return Promise.reject(new Error("Invalid OAuth state; try Connect again."));
      }

      var cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);

      return window.SFExpenseSession.exchangeCodeForTokens(code).then(function () {
        return true;
      });
    },
  };
})();
