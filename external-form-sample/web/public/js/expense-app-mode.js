/**
 * Routes window.ExpenseApp: Salesforce (if signed in) → Supabase (if session) → localStorage.
 */
(function () {
  function impl() {
    try {
      if (
        window.SFExpenseSession &&
        window.SFExpenseSession.isSignedIn() &&
        window.ExpenseAppSalesforce
      ) {
        return window.ExpenseAppSalesforce;
      }
    } catch (e) {}
    try {
      if (
        window.__expenseSupabaseInitDone &&
        window.__supabaseSessionActive &&
        window.ExpenseAppSupabase
      ) {
        return window.ExpenseAppSupabase;
      }
    } catch (e2) {}
    return window.ExpenseAppLocal;
  }

  window.ExpenseApp = new Proxy(
    {},
    {
      get: function (_target, prop) {
        var i = impl();
        var v = i[prop];
        return typeof v === "function" ? v.bind(i) : v;
      },
    }
  );
})();
