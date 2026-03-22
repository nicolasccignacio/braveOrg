/**
 * Prefixes Netlify function paths with window.__NETLIFY_API_ORIGIN__ when the static site
 * is hosted elsewhere (e.g. GitHub Pages) and functions stay on Netlify.
 */
(function (g) {
  function apiOrigin() {
    if (!g || g.__NETLIFY_API_ORIGIN__ === undefined || g.__NETLIFY_API_ORIGIN__ === null) {
      return "";
    }
    return String(g.__NETLIFY_API_ORIGIN__).replace(/\/$/, "");
  }

  g.netlifyFunctionsUrl = function (path) {
    var p = String(path || "");
    if (p.startsWith("/.netlify/functions/")) {
      return apiOrigin() + p;
    }
    return apiOrigin() + "/.netlify/functions/" + p.replace(/^\//, "");
  };
})(typeof window !== "undefined" ? window : globalThis);
