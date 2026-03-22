/**
 * Bank PDF → text → Vercel AI Gateway (AI SDK generateText + model id string).
 * Runs on Netlify only. You do NOT deploy this repo to Vercel.
 *
 * Create an API key in the Vercel dashboard → AI Gateway, then set AI_GATEWAY_API_KEY
 * in Netlify (Site settings → Environment variables).
 *
 * Optional: AI_GATEWAY_MODEL (default google/gemini-2.5-flash), PDF_MAX_PAGES
 */

const { clientIp, allowRequest, json, corsHeaders } = require("./lib/http-helpers");

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 35;

/** Low-cost on AI Gateway (stretches free credits); good for JSON extraction. Override e.g. anthropic/claude-sonnet-4.6. */
const DEFAULT_AI_GATEWAY_MODEL = "google/gemini-2.5-flash";

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

    if (!process.env.AI_GATEWAY_API_KEY || !String(process.env.AI_GATEWAY_API_KEY).trim()) {
      return json(500, event, {
        error:
          "Missing AI_GATEWAY_API_KEY. In Vercel → AI Gateway create an API key (no app deploy required). Add it to Netlify → Site settings → Environment variables.",
      });
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

    const { PDFParse } = await import("pdf-parse");
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

    const { text: modelText } = await generateText({
      model: gatewayModel,
      prompt,
    });

    const transactions = parseTransactionsFromModelText(modelText);

    return json(200, event, {
      transactions,
      meta: {
        rawTextLength: text.length,
        textTruncatedForModel: truncatedText,
        model: gatewayModel,
        via: "vercel-ai-gateway",
        pagesReadCap: maxPages,
      },
    });
  } catch (e) {
    console.error("extract-bank-pdf", e);
    const msg = e.message || "Extraction failed";
    const hint = /API key|Unauthorized|401|AI_GATEWAY|fetch failed/i.test(msg)
      ? " Check AI_GATEWAY_API_KEY in Netlify matches your Vercel AI Gateway key."
      : "";
    return json(500, event, { error: msg + hint });
  }
};
