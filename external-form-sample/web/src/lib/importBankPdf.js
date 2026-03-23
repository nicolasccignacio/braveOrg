/**
 * Browser-only PDF text + optional Gemini (user key) + heuristic fallback.
 */
const PDFJS_VERSION = "4.4.168";
const PDF_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

function heuristicTransactions(text) {
  const lines = String(text || "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out = [];
  const iso = /(\d{4}-\d{2}-\d{2})/;
  const dmy = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/;
  for (const line of lines) {
    let date = "";
    const mi = line.match(iso);
    if (mi) date = mi[1];
    else {
      const md = line.match(dmy);
      if (md) {
        const dd = md[1].padStart(2, "0");
        const mm = md[2].padStart(2, "0");
        let yy = md[3];
        if (yy.length === 2) yy = "20" + yy;
        date = `${yy}-${mm}-${dd}`;
      }
    }
    const nums = line.match(/-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b|-?\d+[.,]\d{2}\b/g);
    if (!date || !nums || !nums.length) continue;
    const raw = nums[nums.length - 1].replace(/\./g, "").replace(",", ".");
    const amount = Math.abs(parseFloat(raw));
    if (!Number.isFinite(amount) || amount < 0.01) continue;
    let desc = line
      .replace(iso, " ")
      .replace(dmy, " ")
      .replace(nums[nums.length - 1], " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
    if (!desc) desc = line.slice(0, 120);
    out.push({ date, description: desc, amount: Math.round(amount * 100) / 100 });
  }
  return out;
}

function parseModelJson(raw) {
  let s = String(raw || "").trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im.exec(s);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model response did not contain JSON");
  s = s.slice(start, end + 1);
  const parsed = JSON.parse(s);
  const transactions = parsed && Array.isArray(parsed.transactions) ? parsed.transactions : null;
  if (!transactions) throw new Error('JSON must include a "transactions" array');
  return transactions.map((row, i) => {
    if (!row || typeof row !== "object") throw new Error("Invalid row " + i);
    const date = row.date != null ? String(row.date) : "";
    const description = row.description != null ? String(row.description) : "";
    const amount = typeof row.amount === "number" ? row.amount : parseFloat(row.amount);
    if (!Number.isFinite(amount)) throw new Error("Invalid amount at " + i);
    return { date, description, amount };
  });
}

async function geminiExtract(text, apiKey, modelId) {
  const model = (modelId || "gemini-2.0-flash").replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const excerpt = text.length > 95000 ? text.slice(0, 95000) : text;
  const prompt = `You are parsing a bank or credit card statement (plain text extracted from a PDF).

Extract individual expense/debit/purchase transactions only — money leaving the account (card purchases, withdrawals, fees, debits).

Do NOT include: opening/closing balances, summary lines, or pure deposits/credits unless reversing a charge.

Keep descriptions in the original language if not English. Infer year from statement headers when missing.

Respond with ONLY valid JSON (no markdown, no explanation), exactly this shape:
{"transactions":[{"date":"YYYY-MM-DD","description":"string","amount":123.45}]}

Use positive numbers for amount (debit/outflow). If none, use {"transactions":[]}.

Statement text:
---
${excerpt}
---
`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || data.error || JSON.stringify(data).slice(0, 200);
    throw new Error(msg || "Gemini request failed");
  }
  const parts = data.candidates?.[0]?.content?.parts;
  const txt = Array.isArray(parts) ? parts.map((p) => p.text || "").join("") : "";
  return parseModelJson(txt);
}

export async function extractPdfText(file, maxPages = 40) {
  const pdfjsLib = await import(
    /* @vite-ignore */ `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.mjs`
  );
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const n = Math.min(pdf.numPages || 0, maxPages);
  let text = "";
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    text += line + "\n\n";
  }
  await pdf.destroy?.();
  return text.trim();
}

export async function extractTransactions(opts) {
  const text = opts.text || "";
  const key = (opts.geminiKey || "").trim();
  if (key) {
    try {
      const transactions = await geminiExtract(text, key, opts.geminiModel);
      return {
        transactions,
        meta: {
          rawTextLength: text.length,
          textTruncatedForModel: text.length > 95000,
          model: opts.geminiModel || "gemini-2.0-flash",
          via: "google-gemini-browser",
        },
      };
    } catch (e) {
      console.warn("Gemini failed, using heuristic:", e);
    }
  }
  const transactions = heuristicTransactions(text);
  return {
    transactions,
    meta: {
      rawTextLength: text.length,
      textTruncatedForModel: false,
      model: "heuristic",
      via: "heuristic-local",
    },
  };
}
