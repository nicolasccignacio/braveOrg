/**
 * Routes window.ExpenseApp to Salesforce REST or localStorage based on OAuth session.
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
