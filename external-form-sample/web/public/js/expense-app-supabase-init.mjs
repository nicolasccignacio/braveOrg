/**
 * Loads Supabase client + ExpenseAppSupabase when URL and anon key are configured.
 * Dispatches window events: expense-backend-ready, expense-auth-changed.
 */
window.__expenseSupabaseInitDone = false;

async function main() {
  const cfg = window.__SUPABASE_CONFIG__ || {};

  if (!cfg.url || !cfg.anonKey) {
    window.__supabaseSessionActive = false;
    window.ExpenseAppSupabase = null;
    window.__supabase = null;
    window.__expenseSupabaseInitDone = true;
    window.dispatchEvent(new CustomEvent("expense-backend-ready"));
    return;
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.0");
  const { buildExpenseAppSupabase } = await import("./expense-app-supabase-api.mjs");

  const supabase = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: localStorage,
    },
  });

  window.__supabase = supabase;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  window.__supabaseSessionActive = !!session;
  window.ExpenseAppSupabase = buildExpenseAppSupabase(supabase);

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    window.__supabaseSessionActive = !!nextSession;
    window.dispatchEvent(new CustomEvent("expense-auth-changed"));
  });

  window.__expenseSupabaseInitDone = true;
  window.dispatchEvent(new CustomEvent("expense-backend-ready"));
}

main().catch((e) => {
  console.error(e);
  window.__supabaseSessionActive = false;
  window.ExpenseAppSupabase = null;
  window.__supabase = null;
  window.__expenseSupabaseInitDone = true;
  window.dispatchEvent(new CustomEvent("expense-backend-ready"));
});
