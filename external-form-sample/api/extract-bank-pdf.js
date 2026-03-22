/**
 * POST JSON body: { pdfBase64: string, filename?: string }
 *
 * LLM calls go through Vercel AI Gateway (see Vercel dashboard → AI Gateway).
 * Env: AI_GATEWAY_API_KEY (recommended for local dev; see Vercel AI Gateway docs).
 * On Vercel, OIDC/keyless auth may apply without setting the key.
 * Optional: AI_GATEWAY_MODEL (default google/gemini-2.0-flash), ALLOWED_ORIGIN, PDF_MAX_PAGES
 */

import { PDFParse } from "pdf-parse";
import { generateObject } from "ai";
import { z } from "zod";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 35;

function setCors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  const allowOrigin = process.env.ALLOWED_ORIGIN || "*";
  setCors(res, allowOrigin);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { pdfBase64, filename: _filename } = req.body || {};
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      res.status(400).json({ error: "JSON body must include pdfBase64 (base64 string)" });
      return;
    }

    const buf = Buffer.from(pdfBase64, "base64");
    if (!buf.length) {
      res.status(400).json({ error: "Invalid base64" });
      return;
    }
    if (buf.length > MAX_BODY_BYTES) {
      res.status(400).json({ error: "PDF too large (max ~4MB before encoding)" });
      return;
    }

    const maxPages = Math.min(
      200,
      Math.max(1, parseInt(process.env.PDF_MAX_PAGES || String(DEFAULT_MAX_PAGES), 10) || DEFAULT_MAX_PAGES)
    );

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
      res.status(422).json({
        error:
          "Could not read enough text from this PDF. Image-only or scanned statements need OCR first.",
      });
      return;
    }

    const maxChars = 95000;
    const excerpt = text.length > maxChars ? text.slice(0, maxChars) : text;
    const truncatedText = text.length > maxChars;

    const schema = z.object({
      transactions: z.array(
        z.object({
          date: z.string().describe("Transaction date as YYYY-MM-DD"),
          description: z.string().describe("Merchant or transaction description"),
          amount: z
            .number()
            .describe("Expense/debit as a positive number (absolute outflow from the account)"),
        })
      ),
    });

    const gatewayModel = process.env.AI_GATEWAY_MODEL || "google/gemini-2.0-flash";

    const { object } = await generateObject({
      model: gatewayModel,
      schema,
      prompt: `You are parsing a bank or credit card statement (plain text extracted from a PDF).

Extract individual expense/debit/purchase transactions only — money leaving the account (card purchases, withdrawals, fees charged to the card, debits).

Do NOT include: opening/closing balances, summary lines, interest earned as a credit-only row, or pure deposits/credits unless the user would treat them as reversing a charge.

If the statement language is not English, keep descriptions in the original language.

Infer calendar year from statement period headers when the year is missing from a line.

Statement text:
---
${excerpt}
---`,
    });

    res.status(200).json({
      transactions: object.transactions,
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
    const hint =
      /API key|Unauthorized|401|AI_GATEWAY/i.test(msg) &&
      process.env.VERCEL !== "1"
        ? " Set AI_GATEWAY_API_KEY for local runs, or see Vercel AI Gateway authentication."
        : "";
    res.status(500).json({
      error: msg + hint,
    });
  }
}
