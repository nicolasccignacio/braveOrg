/**
 * Supabase project URL and anon key (safe to expose in the browser; protect data with RLS).
 * CI can overwrite this file from vars SUPABASE_URL and SUPABASE_ANON_KEY.
 */
(function () {
  window.__SUPABASE_CONFIG__ = window.__SUPABASE_CONFIG__ || {
    url: "",
    anonKey: "",
  };
})();
