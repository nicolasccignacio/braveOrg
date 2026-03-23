import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExpenseAppBridge } from "../context/ExpenseAppBridge.jsx";

function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSfOAuthClientConfigured() {
  const s = window.SFExpenseSession;
  if (!s) return false;
  if (typeof s.hasOAuthClientConfigured === "function") return s.hasOAuthClientConfigured();
  if (typeof s.getClientId === "function") return !!String(s.getClientId() || "").trim();
  return false;
}

function supabaseCfg() {
  return window.__SUPABASE_CONFIG__ || {};
}

export default function CreateExpensePage() {
  const { version, bump } = useExpenseAppBridge();

  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [items, setItems] = useState([]);
  const [listOpen, setListOpen] = useState(false);
  const [itemStatus, setItemStatus] = useState({ kind: "", text: "" });
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expenseDate, setExpenseDate] = useState(todayLocal());
  const [cuotas, setCuotas] = useState("");
  const [referencia, setReferencia] = useState("");
  const [submitMsg, setSubmitMsg] = useState({ kind: "", text: "" });
  const [history, setHistory] = useState([]);
  const [historyMsg, setHistoryMsg] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickMsg, setQuickMsg] = useState({ kind: "", text: "" });
  const [sbEmail, setSbEmail] = useState("");
  const [sbPassword, setSbPassword] = useState("");
  const [sbAuthMsg, setSbAuthMsg] = useState("");
  const [importMsg, setImportMsg] = useState({ kind: "", text: "" });

  const [editing, setEditing] = useState(null);
  const [editItemId, setEditItemId] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCuotas, setEditCuotas] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editErr, setEditErr] = useState("");

  const dialogRef = useRef(null);
  const fileImportRef = useRef(null);

  const { sf, modeHintHtml, dataHintHtml } = useMemo(() => {
    const a = window.ExpenseApp;
    const usesSf = a?.usesSalesforceBackend?.() ?? false;
    const usesSb = a?.usesSupabaseBackend?.() ?? false;
    let modeHintHtml = "";
    if (usesSf) {
      modeHintHtml =
        "<strong>Salesforce:</strong> standard REST API against <code>Item__c</code> and <code>Expense_Item_Price__c</code> (as your signed-in user).";
    } else if (usesSb) {
      modeHintHtml =
        "<strong>Supabase:</strong> items and expenses are stored in Postgres for your signed-in user (Row Level Security). Disconnect Salesforce and sign out of Supabase to use browser-only storage.";
    } else {
      modeHintHtml =
        "<strong>Browser-only:</strong> data in <code>localStorage</code> on this device. Use <strong>Salesforce</strong> or <strong>Supabase</strong> above for cloud sync.";
    }
    let dataHintHtml = "";
    if (usesSf) {
      dataHintHtml =
        "Export downloads JSON from Salesforce (REST query). Import is disabled — use Data Loader or disconnect and use browser-only mode.";
    } else if (usesSb) {
      dataHintHtml =
        "Export downloads JSON from your Supabase project. Import replaces all items and expenses for this account.";
    } else {
      dataHintHtml = "Export a JSON backup. Import replaces all items and expenses in this browser.";
    }
    return { sf: usesSf, modeHintHtml, dataHintHtml };
  }, [version]);

  const loadItems = useCallback(
    async (selectId) => {
      setItemStatus({ kind: "", text: "" });
      try {
        const data = await window.ExpenseApp.searchItems("", 2000);
        const list = data?.records || [];
        setItems(list);
        if (selectId) {
          const found = list.find((x) => x.id === selectId);
          if (found) {
            setItemId(selectId);
            setItemSearch(found.name);
          }
        }
      } catch (e) {
        setItems([]);
        setItemStatus({ kind: "error", text: String(e.message || e) });
      }
    },
    []
  );

  const loadHistory = useCallback(async () => {
    setHistoryMsg("");
    try {
      const data = await window.ExpenseApp.listHistory(50);
      setHistory(data?.records || []);
    } catch (e) {
      setHistory([]);
      setHistoryMsg(String(e.message || e));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await loadItems();
    await loadHistory();
  }, [loadItems, loadHistory]);

  useEffect(() => {
    let flash = null;
    try {
      flash = sessionStorage.getItem("expenseSf_oauth_flash_error");
      if (flash) sessionStorage.removeItem("expenseSf_oauth_flash_error");
    } catch (e) {}
    if (flash) setSubmitMsg({ kind: "err", text: flash });
  }, []);

  useEffect(() => {
    refreshAll();
  }, [version, refreshAll]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    const onPageShow = (ev) => {
      if (ev.persisted) refreshAll();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [refreshAll]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const sorted = items.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (!q) return sorted.slice(0, 150);
    return sorted.filter((it) => String(it.name).toLowerCase().includes(q)).slice(0, 50);
  }, [items, itemSearch]);

  const pickItem = (it) => {
    setItemId(it.id);
    setItemSearch(it.name);
    setListOpen(false);
    setItemStatus({ kind: "", text: "" });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitMsg({ kind: "", text: "" });
    if (!itemId) {
      setSubmitMsg({ kind: "err", text: "Choose an item in the list." });
      return;
    }
    try {
      await window.ExpenseApp.submitExpense({
        website: "",
        itemId,
        price,
        quantity,
        expenseDate: expenseDate || null,
        cuotas,
        referencia: referencia.trim() || null,
      });
      const usesSf = window.ExpenseApp.usesSalesforceBackend();
      const usesSb =
        window.ExpenseApp.usesSupabaseBackend && window.ExpenseApp.usesSupabaseBackend();
      setSubmitMsg({
        kind: "ok",
        text: usesSf
          ? "Expense saved in Salesforce."
          : usesSb
            ? "Expense saved to Supabase."
            : "Expense saved in this browser.",
      });
      setQuantity("1");
      setExpenseDate(todayLocal());
      setPrice("");
      setCuotas("");
      setReferencia("");
      await refreshAll();
    } catch (err) {
      setSubmitMsg({ kind: "err", text: String(err.message || err) });
    }
  };

  const openEdit = (row) => {
    setEditing(row);
    setEditItemId(row.itemId);
    setEditPrice(row.price != null ? String(row.price) : "");
    setEditQty(row.quantity != null ? String(row.quantity) : "");
    setEditDate(row.expenseDate || "");
    setEditCuotas(row.cuotas != null ? String(row.cuotas) : "");
    setEditRef(row.referencia != null ? String(row.referencia) : "");
    setEditErr("");
    dialogRef.current?.showModal();
  };

  const saveEdit = async () => {
    if (!editing) return;
    setEditErr("");
    if (!editItemId) {
      setEditErr("Choose an item.");
      return;
    }
    try {
      await window.ExpenseApp.updateExpense({
        website: "",
        recordId: editing.id,
        itemId: editItemId,
        price: editPrice,
        quantity: editQty,
        expenseDate: editDate || null,
        cuotas: editCuotas,
        referencia: editRef.trim() || null,
      });
      dialogRef.current?.close();
      setEditing(null);
      await loadHistory();
    } catch (e) {
      setEditErr(String(e.message || e));
    }
  };

  const deleteRow = async (row) => {
    if (!window.confirm("Delete this expense?")) return;
    try {
      await window.ExpenseApp.deleteExpense({ recordId: row.id, website: "" });
      await loadHistory();
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const cfg = supabaseCfg();
  const sbOk = !!(cfg.url && cfg.anonKey);
  const sbSignedIn = sbOk && window.__supabaseSessionActive;

  return (
    <main className="md-main md-container">
      <h1 className="md-display-small">Create expense</h1>
      <p
        className="hint md-body-text"
        style={{ marginTop: "-0.25rem" }}
        dangerouslySetInnerHTML={{ __html: modeHintHtml }}
      />

      <details className="md-disclosure hint" id="sfConnectPanel">
        <summary>Salesforce</summary>
        <p className="md-body-text" style={{ marginBottom: "0.75rem" }}>
          {isSfOAuthClientConfigured()
            ? "Sign in to use your org’s data. Login URL, Client ID, and API version are set when the site is built."
            : "This build has no Salesforce Client ID yet. Set repository variables SF_CLIENT_ID before deploy, or edit public/js/sf-config.js for local use."}
        </p>
        <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            className="md-btn md-btn--filled"
            disabled={!isSfOAuthClientConfigured()}
            onClick={() => window.SFExpenseSession?.beginOAuth().catch((e) => alert(String(e.message || e)))}
          >
            Connect with Salesforce
          </button>
          <button
            type="button"
            className="md-btn md-btn--outlined"
            onClick={() => {
              window.SFExpenseSession?.disconnect();
              bump();
              refreshAll();
            }}
          >
            Disconnect
          </button>
          <button
            type="button"
            className="md-btn md-btn--outlined"
            onClick={() => {
              window.SFExpenseSession?.setBrowserOnlyMode();
              bump();
              refreshAll();
            }}
          >
            Use browser only
          </button>
        </p>
      </details>

      <details className="md-disclosure hint" id="supabasePanel">
        <summary>Supabase (cloud account)</summary>
        <p className="md-body-text" style={{ marginBottom: "0.75rem" }}>
          {sbOk
            ? "Sign in to sync items and expenses to your Supabase project."
            : "Not configured: set SUPABASE_URL and SUPABASE_ANON_KEY in deploy variables, or edit public/js/supabase-config.js."}
        </p>
        {!sbSignedIn && (
          <div className="supabase-auth-row">
            <label className="supabase-field">
              Email
              <input
                type="email"
                autoComplete="username"
                value={sbEmail}
                onChange={(e) => setSbEmail(e.target.value)}
                disabled={!sbOk}
              />
            </label>
            <label className="supabase-field">
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={sbPassword}
                onChange={(e) => setSbPassword(e.target.value)}
                disabled={!sbOk}
              />
            </label>
            <button
              type="button"
              className="md-btn md-btn--filled"
              disabled={!sbOk}
              onClick={async () => {
                setSbAuthMsg("");
                try {
                  const res = await window.__supabase?.auth.signInWithPassword({
                    email: sbEmail.trim(),
                    password: sbPassword,
                  });
                  if (res?.error) throw res.error;
                  setSbAuthMsg("Signed in.");
                  bump();
                  refreshAll();
                } catch (e) {
                  setSbAuthMsg(String(e.message || e));
                }
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className="md-btn md-btn--outlined"
              disabled={!sbOk}
              onClick={async () => {
                setSbAuthMsg("");
                try {
                  const res = await window.__supabase?.auth.signUp({
                    email: sbEmail.trim(),
                    password: sbPassword,
                  });
                  if (res?.error) throw res.error;
                  setSbAuthMsg(
                    res.data?.session
                      ? "Account created and signed in."
                      : "Check your email to confirm the account (if enabled in Supabase)."
                  );
                  bump();
                  refreshAll();
                } catch (e) {
                  setSbAuthMsg(String(e.message || e));
                }
              }}
            >
              Create account
            </button>
          </div>
        )}
        {sbSignedIn && (
          <div className="supabase-auth-row supabase-auth-row--signedin">
            <span className="md-body-text">Signed in</span>
            <button
              type="button"
              className="md-btn md-btn--outlined"
              onClick={async () => {
                await window.__supabase?.auth.signOut();
                setSbAuthMsg("");
                bump();
                refreshAll();
              }}
            >
              Sign out
            </button>
          </div>
        )}
        {sbAuthMsg ? (
          <p className="history-status" role="status" style={{ marginTop: "0.5rem" }}>
            {sbAuthMsg}
          </p>
        ) : null}
      </details>

      <section className="md-section-card" aria-labelledby="expense-heading">
        <h2 id="expense-heading" className="md-title-large">
          Expense
        </h2>
        <form onSubmit={onSubmit} noValidate>
          <input type="text" name="website" className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />

          <div className="item-field-header">
            <label htmlFor="itemSearch">Item</label>
            <button
              type="button"
              className="btn-icon-add"
              aria-expanded={quickOpen}
              onClick={() => setQuickOpen((o) => !o)}
              title="Create new item"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                add
              </span>
            </button>
          </div>
          {quickOpen ? (
            <div className="quick-item-panel" style={{ marginBottom: "0.75rem" }}>
              <div className="quick-item-row">
                <input
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder="New item name"
                  aria-label="New item name"
                />
                <button
                  type="button"
                  className="md-btn md-btn--filled"
                  onClick={async () => {
                    const n = quickName.trim();
                    if (!n) {
                      setQuickMsg({ kind: "err", text: "Enter a name." });
                      return;
                    }
                    try {
                      const data = await window.ExpenseApp.createItem(n);
                      setQuickName("");
                      setQuickMsg({ kind: "ok", text: "Created." });
                      setQuickOpen(false);
                      await loadItems(data.id);
                    } catch (e) {
                      setQuickMsg({ kind: "err", text: String(e.message || e) });
                    }
                  }}
                >
                  Add
                </button>
              </div>
              {quickMsg.text ? (
                <p className={"quick-item-msg" + (quickMsg.kind ? " " + quickMsg.kind : "")}>{quickMsg.text}</p>
              ) : null}
            </div>
          ) : null}

          <div className="item-combobox">
            <input
              id="itemSearch"
              value={itemSearch}
              onChange={(e) => {
                setItemSearch(e.target.value);
                setItemId("");
                setListOpen(true);
              }}
              onFocus={() => setListOpen(true)}
              onBlur={() => window.setTimeout(() => setListOpen(false), 200)}
              autoComplete="off"
              placeholder={itemStatus.text ? "Could not load" : "Search items…"}
              aria-expanded={listOpen}
              aria-controls="itemListbox"
              role="combobox"
            />
            {listOpen && filteredItems.length > 0 ? (
              <ul className="item-listbox" id="itemListbox" role="listbox" aria-label="Items">
                {filteredItems.map((it) => (
                  <li
                    key={it.id}
                    role="option"
                    className="item-option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickItem(it)}
                  >
                    {it.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={"item-status" + (itemStatus.kind === "error" ? " error" : "")} role="status">
            {itemStatus.text}
          </div>

          <input type="hidden" name="itemId" value={itemId} readOnly />

          <label htmlFor="price">Price</label>
          <input id="price" type="number" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />

          <label htmlFor="quantity">Quantity</label>
          <input
            id="quantity"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />

          <label htmlFor="expenseDate">Expense date</label>
          <input id="expenseDate" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />

          <label htmlFor="cuotas">Cuotas</label>
          <input id="cuotas" type="number" step="1" inputMode="numeric" value={cuotas} onChange={(e) => setCuotas(e.target.value)} />

          <label htmlFor="referencia">Referencia</label>
          <input id="referencia" type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} />

          <button type="submit" className="md-btn md-btn--filled">
            Save expense
          </button>
        </form>
        {submitMsg.text ? (
          <div className={"msg" + (submitMsg.kind === "ok" ? " ok" : submitMsg.kind === "err" ? " err" : "")} role="status">
            {submitMsg.text}
          </div>
        ) : null}
      </section>

      <section className="md-section-card" aria-labelledby="history-heading">
        <h2 id="history-heading" className="md-title-large">
          History
        </h2>
        <div className="history-wrap">
          <table className="history" aria-label="Expense history">
            <thead>
              <tr>
                <th>Item</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Expense date</th>
                <th>Created</th>
                <th className="history-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6}>{historyMsg || "No rows yet."}</td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id}>
                    <td>{row.itemName}</td>
                    <td>{row.price}</td>
                    <td>{row.quantity}</td>
                    <td>{row.expenseDate || "—"}</td>
                    <td>{row.createdDate ? String(row.createdDate).slice(0, 19).replace("T", " ") : "—"}</td>
                    <td className="history-actions">
                      <button type="button" className="md-btn md-btn--text" onClick={() => openEdit(row)}>
                        Edit
                      </button>
                      <button type="button" className="md-btn md-btn--text" onClick={() => deleteRow(row)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="md-section-card" aria-labelledby="data-heading">
        <h2 id="data-heading" className="md-title-large">
          Your data
        </h2>
        <p className="hint md-body-text" style={{ marginBottom: "0.75rem" }} dangerouslySetInnerHTML={{ __html: dataHintHtml }} />
        <p style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem 1.25rem", alignItems: "flex-end", margin: 0 }}>
          <button
            type="button"
            className="md-btn md-btn--outlined"
            onClick={async () => {
              try {
                const json = await Promise.resolve(window.ExpenseApp.exportAll());
                const blob = new Blob([json], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "expense-app-backup.json";
                a.click();
                URL.revokeObjectURL(a.href);
              } catch (e) {
                alert(String(e.message || e));
              }
            }}
          >
            Export data
          </button>
          <label className="md-import-label" style={{ display: "inline-block", fontSize: "0.75rem", fontWeight: 500 }}>
            Import backup
            <input
              ref={fileImportRef}
              type="file"
              accept="application/json,.json"
              disabled={sf}
              title={sf ? "Import is only available outside Salesforce mode." : ""}
              style={{ display: "block", marginTop: "0.35rem" }}
              onChange={async (ev) => {
                const f = ev.target.files?.[0];
                ev.target.value = "";
                if (!f) return;
                setImportMsg({ kind: "", text: "" });
                try {
                  const text = await f.text();
                  await window.ExpenseApp.importAll(text);
                  setImportMsg({ kind: "ok", text: "Backup imported." });
                  await refreshAll();
                } catch (err) {
                  setImportMsg({ kind: "err", text: "Import failed: " + (err.message || err) });
                }
              }}
            />
          </label>
        </p>
        {importMsg.text ? (
          <p className={"msg" + (importMsg.kind === "ok" ? " ok" : " err")} style={{ marginTop: "0.75rem" }}>
            {importMsg.text}
          </p>
        ) : null}
      </section>

      <dialog ref={dialogRef} className="edit-dialog" aria-labelledby="editExpenseTitle" onClose={() => setEditing(null)}>
        <h3 id="editExpenseTitle">Edit expense</h3>
        {editing ? (
          <p className="edit-meta">
            {editing.name} · {editing.id}
          </p>
        ) : null}
        <label htmlFor="editItemSelect">Item</label>
        <select id="editItemSelect" value={editItemId} onChange={(e) => setEditItemId(e.target.value)}>
          <option value="">—</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name}
            </option>
          ))}
        </select>
        <label htmlFor="editPrice">Price</label>
        <input id="editPrice" type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
        <label htmlFor="editQuantity">Quantity</label>
        <input id="editQuantity" type="number" step="0.01" value={editQty} onChange={(e) => setEditQty(e.target.value)} />
        <label htmlFor="editExpenseDate">Expense date</label>
        <input id="editExpenseDate" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
        <label htmlFor="editCuotas">Cuotas</label>
        <input id="editCuotas" type="number" step="1" value={editCuotas} onChange={(e) => setEditCuotas(e.target.value)} />
        <label htmlFor="editReferencia">Referencia</label>
        <input id="editReferencia" type="text" value={editRef} onChange={(e) => setEditRef(e.target.value)} />
        <div className="edit-dialog-actions">
          <button type="button" className="md-btn md-btn--text" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="button" className="md-btn md-btn--filled" onClick={saveEdit}>
            Save
          </button>
        </div>
        {editErr ? <p className="history-status">{editErr}</p> : null}
      </dialog>
    </main>
  );
}
