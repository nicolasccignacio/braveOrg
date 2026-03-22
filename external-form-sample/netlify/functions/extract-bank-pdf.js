/**
 * Bank PDF → text → AI (Vercel AI Gateway or Google Gemini via @ai-sdk/google).
 * Runs on Netlify only.
 *
 * Prefer Google AI Studio (no Vercel card): set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY
 * (Functions scope). Optional: GEMINI_MODEL (default gemini-2.5-flash).
 *
 * Or Vercel AI Gateway: AI_GATEWAY_API_KEY (alias AI_GATEWAY_KEY). Optional: AI_GATEWAY_MODEL
 * (default google/gemini-2.5-flash). Gateway may require a payment method on the Vercel account.
 *
 * Optional: PDF_MAX_PAGES
 */

const { pathToFileURL } = require("url");

const { clientIp, allowRequest, json, corsHeaders } = require("./lib/http-helpers");

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 35;

/** Low-cost; good for JSON extraction. Gateway-only models use provider prefix (e.g. anthropic/claude-…). */
const DEFAULT_AI_GATEWAY_MODEL = "google/gemini-2.5-flash";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/**
 * pdf.js (bundled with pdf-parse v2) expects `DOMMatrix` / `Path2D` / `ImageData` on globalThis.
 * The package's `pdf-parse/worker` entry sets these from `@napi-rs/canvas`; the default export does not.
 */
function ensurePdfCanvasGlobals() {
  if (typeof globalThis.DOMMatrix !== "undefined") {
    return;
  }
  try {
    const { DOMMatrix, Path2D, ImageData } = require("@napi-rs/canvas");
    globalThis.DOMMatrix = DOMMatrix;
    if (typeof globalThis.Path2D === "undefined" && Path2D) {
      globalThis.Path2D = Path2D;
    }
    if (typeof globalThis.ImageData === "undefined" && ImageData) {
      globalThis.ImageData = ImageData;
    }
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(
      "PDF parsing needs @napi-rs/canvas (DOMMatrix for pdf.js). Ensure it is installed and not stripped by the bundler. " +
        msg
    );
  }
}

/**
 * AI SDK Gateway reads `AI_GATEWAY_API_KEY`. Netlify must expose vars to Functions (scope Functions or All).
 * @returns {string} trimmed key or empty
 */
function resolveAiGatewayApiKey() {
  const raw = process.env.AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_KEY;
  if (raw == null) return "";
  return String(raw).trim();
}

/** Google Generative AI (AI Studio); avoids Vercel AI Gateway billing requirements. */
function resolveGoogleGenerativeAiKey() {
  const raw = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (raw == null) return "";
  return String(raw).trim();
}

/**
 * Model id for @ai-sdk/google. Uses GEMINI_MODEL, or strips `google/` from AI_GATEWAY_MODEL, or default.
 * @returns {string}
 */
function resolveGeminiModelId() {
  const direct = process.env.GEMINI_MODEL || process.env.GOOGLE_GENERATIVE_AI_MODEL;
  if (direct != null && String(direct).trim()) {
    return String(direct).trim();
  }
  const gatewayStyle = process.env.AI_GATEWAY_MODEL || DEFAULT_AI_GATEWAY_MODEL;
  if (gatewayStyle.startsWith("google/")) {
    return gatewayStyle.slice("google/".length);
  }
  return DEFAULT_GEMINI_MODEL;
}

function parseTransactionsFromModelText(raw) {
  let s = String(raw || "").trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im.exec(s);
  if (fence) s = fence[1].trim();

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model response did not contain a JSON object");
  }
  s = s.slice(start, end + 1);

  let parsed;
  try {
    parsed = JSON.parse(s);
  } catch {
    throw new Error("Model response was not valid JSON");
  }

  const transactions = parsed && Array.isArray(parsed.transactions) ? parsed.transactions : null;
  if (!transactions) {
    throw new Error('JSON must be an object with a "transactions" array');
  }

  return transactions.map((row, i) => {
    if (!row || typeof row !== "object") {
      throw new Error("Invalid transaction at index " + i);
    }
    const date = row.date != null ? String(row.date) : "";
    const description = row.description != null ? String(row.description) : "";
    const amount = typeof row.amount === "number" ? row.amount : parseFloat(row.amount);
    if (!Number.isFinite(amount)) {
      throw new Error("Invalid amount at index " + i);
    }
    return { date, description, amount };
  });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders(event), body: "" };
    }

    if (event.httpMethod !== "POST") {
      return json(405, event, { error: "Method not allowed" });
    }

    const ip = clientIp(event);
    if (!allowRequest(ip, "search")) {
      return json(429, event, { error: "Too many requests. Try again in a minute." });
    }

    const googleKey = resolveGoogleGenerativeAiKey();
    const gatewayKey = resolveAiGatewayApiKey();
    if (!googleKey && !gatewayKey) {
      return json(500, event, {
        error: "No AI credentials in the function runtime.",
        hint:
          "Option A — Google (no Vercel card): get an API key from Google AI Studio, add GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY in Netlify (Functions scope). Option B — Vercel AI Gateway: add AI_GATEWAY_API_KEY (may require a payment method on Vercel). Redeploy after saving env vars.",
      });
    }
    if (gatewayKey) {
      process.env.AI_GATEWAY_API_KEY = gatewayKey;
    }

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return json(400, event, { error: "Invalid JSON" });
    }

    const pdfBase64 = payload.pdfBase64;
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return json(400, event, { error: "JSON body must include pdfBase64 (base64 string)" });
    }

    const buf = Buffer.from(pdfBase64, "base64");
    if (!buf.length) {
      return json(400, event, { error: "Invalid base64" });
    }
    if (buf.length > MAX_BODY_BYTES) {
      return json(400, event, { error: "PDF too large (max ~4MB before encoding)" });
    }

    const maxPages = Math.min(
      200,
      Math.max(1, parseInt(process.env.PDF_MAX_PAGES || String(DEFAULT_MAX_PAGES), 10) || DEFAULT_MAX_PAGES)
    );

    ensurePdfCanvasGlobals();
    const { PDFParse } = await import("pdf-parse");
    // pdf.js fake worker uses dynamic import(workerSrc); Netlify may omit pdf.worker.mjs unless pdfjs-dist is external + included.
    const workerFsPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    PDFParse.setWorker(pathToFileURL(workerFsPath).href);

    const { generateText } = await import("ai");

    const parser = new PDFParse({ data: buf });
    let text = "";
    try {
      let result;
      try {
        const info = await parser.getInfo();
        const total = typeof info.total === "number" && info.total > 0 ? info.total : maxPages;
        const pagesToRead = Math.min(total, maxPages);
        const partial = Array.from({ length: pagesToRead }, (_, i) => i + 1);
        result = await parser.getText({ partial });
      } catch {
        const partial = Array.from({ length: maxPages }, (_, i) => i + 1);
        result = await parser.getText({ partial });
      }
      text = (result.text || "").trim();
    } finally {
      await parser.destroy();
    }

    if (!text || text.length < 15) {
      return json(422, event, {
        error:
          "Could not read enough text from this PDF. Image-only or scanned statements need OCR first.",
      });
    }

    const maxChars = 95000;
    const excerpt = text.length > maxChars ? text.slice(0, maxChars) : text;
    const truncatedText = text.length > maxChars;

    const gatewayModel = process.env.AI_GATEWAY_MODEL || DEFAULT_AI_GATEWAY_MODEL;
    const geminiModelId = resolveGeminiModelId();

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

    let modelText;
    let modelLabel;
    let via;

    if (googleKey) {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const googleProvider = createGoogleGenerativeAI({ apiKey: googleKey });
      const gt = await generateText({
        model: googleProvider(geminiModelId),
        prompt,
      });
      modelText = gt.text;
      modelLabel = geminiModelId;
      via = "google-generative-ai";
    } else {
      const gt = await generateText({
        model: gatewayModel,
        prompt,
      });
      modelText = gt.text;
      modelLabel = gatewayModel;
      via = "vercel-ai-gateway";
    }

    const transactions = parseTransactionsFromModelText(modelText);

    return json(200, event, {
      transactions,
      meta: {
        rawTextLength: text.length,
        textTruncatedForModel: truncatedText,
        model: modelLabel,
        via,
        pagesReadCap: maxPages,
      },
    });
  } catch (e) {
    console.error("extract-bank-pdf", e);
    const msg = e.message || "Extraction failed";
    let hint = "";
    if (/credit card|add-credit-card|unlock your free credits/i.test(msg)) {
      hint =
        " Vercel AI Gateway requires a payment method on the Vercel account. Use Google AI Studio and set GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY) in Netlify to call Gemini directly instead.";
    } else if (/API key|Unauthorized|401|AI_GATEWAY|fetch failed|Generative Language|GOOGLE/i.test(msg)) {
      hint =
        " Check GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY or AI_GATEWAY_API_KEY in Netlify (Functions scope) and redeploy.";
    }
    return json(500, event, { error: msg + hint });
  }
};
