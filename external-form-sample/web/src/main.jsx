import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

function loadSupabaseInit() {
  const base = import.meta.env.BASE_URL;
  return new Promise((resolve) => {
    const done = () => resolve();
    window.addEventListener("expense-backend-ready", done, { once: true });
    const s = document.createElement("script");
    s.type = "module";
    s.src = `${base}js/expense-app-supabase-init.mjs`;
    s.onerror = done;
    document.head.appendChild(s);
    window.setTimeout(done, 12000);
  });
}

async function boot() {
  await loadSupabaseInit();
  if (window.SFExpenseSession) {
    try {
      await window.SFExpenseSession.handleRedirectIfPresent();
    } catch (e) {
      try {
        sessionStorage.setItem("expenseSf_oauth_flash_error", String(e.message || e));
      } catch (err) {}
    }
  }
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

boot();
