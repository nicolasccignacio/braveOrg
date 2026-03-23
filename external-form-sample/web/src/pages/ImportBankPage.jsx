import { useEffect, useState } from "react";
import { extractPdfText, extractTransactions } from "../lib/importBankPdf.js";

const LS_KEY = "bankImportGeminiKey";
const LS_MODEL = "bankImportGeminiModel";

export default function ImportBankPage() {
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ kind: "", text: "" });
  const [metaLine, setMetaLine] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    setGeminiKey(localStorage.getItem(LS_KEY) || "");
    setGeminiModel(localStorage.getItem(LS_MODEL) || "");
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_KEY, geminiKey.trim());
  }, [geminiKey]);

  useEffect(() => {
    localStorage.setItem(LS_MODEL, geminiModel.trim());
  }, [geminiModel]);

  const showStatus = (kind, text) => {
    setStatus({ kind, text });
  };

  const onExtract = async () => {
    if (!file) {
      showStatus("err", "Choose a PDF file.");
      return;
    }
    showStatus("", "");
    setMetaLine("");
    setRows([]);
    setBusy(true);
    try {
      showStatus("", "Reading PDF…");
      const text = await extractPdfText(file, 40);
      if (!text || text.length < 15) {
        showStatus(
          "err",
          "Could not read enough text from this PDF. Image-only statements need OCR elsewhere first."
        );
        return;
      }
      showStatus("", "Parsing…");
      const data = await extractTransactions({
        text,
        geminiKey: geminiKey.trim(),
        geminiModel: geminiModel.trim() || undefined,
      });
      const list = Array.isArray(data.transactions) ? data.transactions : [];
      if (!list.length) {
        showStatus("ok", "No transactions found. Try adding a Gemini key or a different PDF layout.");
        return;
      }
      showStatus("ok", `Extracted ${list.length} row(s). Verify each line against your PDF.`);
      const m = data.meta || {};
      setMetaLine(
        (m.via ? `Mode: ${m.via}. ` : "") +
          (m.model ? `Model: ${m.model}. ` : "") +
          (m.rawTextLength != null ? `Text length: ${m.rawTextLength} chars. ` : "") +
          (m.textTruncatedForModel ? "Text truncated for API limit. " : "")
      );
      setRows(list);
    } catch (e) {
      showStatus("err", String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="md-main md-container md-container--import">
      <h1 className="md-display-small">Import bank statement (PDF)</h1>
      <p className="hint md-body-text">
        <strong>Browser-only:</strong> PDF text is extracted with pdf.js here. Optionally add a{" "}
        <a href="https://aistudio.google.com/apikey" rel="noopener noreferrer">
          Gemini API key
        </a>{" "}
        for smarter parsing (sent from your browser to Google; may be blocked by CORS — then a simple line parser runs).
        Verify every row against your PDF.
      </p>

      <details className="md-disclosure setup">
        <summary>How this page works</summary>
        <ol>
          <li>No server required — works on GitHub Pages.</li>
          <li>Text-based PDFs only (not scanned images).</li>
          <li>
            Optional Gemini key is stored in <code>localStorage</code> on this device. Treat it like a password.
          </li>
        </ol>
      </details>

      <h2 className="md-title-large" style={{ marginTop: "1.5rem" }}>
        Optional: Gemini API
      </h2>
      <label htmlFor="geminiKey">API key (optional)</label>
      <input
        id="geminiKey"
        type="password"
        autoComplete="off"
        placeholder="From Google AI Studio"
        value={geminiKey}
        onChange={(e) => setGeminiKey(e.target.value)}
      />
      <label htmlFor="geminiModel">Model id (optional)</label>
      <input
        id="geminiModel"
        type="text"
        autoComplete="off"
        placeholder="gemini-2.0-flash"
        value={geminiModel}
        onChange={(e) => setGeminiModel(e.target.value)}
      />
      <p className="hint">Leave the key empty to use heuristic parsing only.</p>

      <h2 className="md-title-large" style={{ marginTop: "1.5rem" }}>
        PDF file
      </h2>
      <label htmlFor="pdfFile">Statement (.pdf)</label>
      <input
        id="pdfFile"
        type="file"
        accept=".pdf,application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <button type="button" className="md-btn md-btn--filled" style={{ marginTop: "1rem" }} disabled={busy || !file} onClick={onExtract}>
        <span className="material-symbols-outlined" aria-hidden="true">
          description
        </span>
        Extract expenses
      </button>

      {status.text ? (
        <div
          className={"msg" + (status.kind ? " " + status.kind : "")}
          role="status"
          style={{ marginTop: "1rem", display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          {status.text}
        </div>
      ) : null}

      {metaLine ? <p className="hint" style={{ marginTop: "0.75rem" }}>{metaLine}</p> : null}

      {rows.length > 0 ? (
        <div className="table-wrap" style={{ marginTop: "1rem" }}>
          <table className="results" aria-label="Extracted transactions">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td>{row.date != null ? String(row.date) : "—"}</td>
                  <td>{row.description != null ? String(row.description) : "—"}</td>
                  <td className="num">{row.amount != null ? String(row.amount) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="disclaimer">
        This tool does not post to Salesforce automatically. Use the main expense form to enter verified rows.
      </p>
    </main>
  );
}
