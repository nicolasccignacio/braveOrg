import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const Ctx = createContext(null);

export function ExpenseAppProvider({ children }) {
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    window.addEventListener("expense-backend-ready", bump);
    window.addEventListener("expense-auth-changed", bump);
    return () => {
      window.removeEventListener("expense-backend-ready", bump);
      window.removeEventListener("expense-auth-changed", bump);
    };
  }, [bump]);

  const value = useMemo(
    () => ({
      version,
      bump,
      getApp: () => window.ExpenseApp,
    }),
    [version, bump]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExpenseAppBridge() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useExpenseAppBridge requires ExpenseAppProvider");
  return v;
}
