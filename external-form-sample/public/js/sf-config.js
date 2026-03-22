/**
 * Deploy-time Salesforce settings (public Client ID is OK for PKCE).
 * GitHub Actions overwrites this file from repo variables SF_CLIENT_ID, SF_INSTANCE_URL (OAuth host), SF_API_VERSION.
 * For local testing, set clientId below or run the same deploy step.
 */
(function () {
  window.__EXPENSE_SF_CONFIG__ = window.__EXPENSE_SF_CONFIG__ || {
    clientId: "",
    loginHost: "https://login.salesforce.com",
    apiVersion: "v63.0",
  };
})();
