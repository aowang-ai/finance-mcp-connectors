import { z } from "zod";
import { defineEndpoint, endpointUrl } from "../../../../src/core/define.js";
import { asArray, asRecord, optionalNumber, optionalString } from "../../../../src/core/json.js";
import provider from "../../provider.js";

const input = z.object({
  symbol: z.string().min(1).describe("Ticker, for example AAPL."),
  period: z
    .enum(["annual", "quarter"])
    .default("annual")
    .describe("annual or quarter. Default annual."),
  limit: z.number().int().min(1).max(20).default(5).describe("Number of statements. Default 5."),
});

export default defineEndpoint({
  provider,
  name: "income-statement",
  meta: {
    displayName: "FMP income statement",
    summary:
      "Structured income statement (revenue, margins, EPS) for a ticker, annual or quarterly.",
    description:
      "Income statement rows from Financial Modeling Prep for one ticker. Requires FMP_API_KEY. period is annual or quarter. Figures are the values FMP returns for that filing.",
    tags: ["equity", "fundamentals", "financials", "earnings", "revenue", "profit", "10-k", "10-q"],
    docsUrl: "https://site.financialmodelingprep.com/developer/docs",
  },
  input,
  outputShape: {
    type: "object",
    required: ["symbol", "period", "statements"],
    properties: {
      symbol: { type: "string" },
      period: { type: "string" },
      statements: {
        type: "array",
        items: {
          type: "object",
          required: ["date", "revenue", "netIncome"],
          properties: {
            date: { type: "string" },
            fiscalYear: { type: ["string", "null"] },
            period: { type: ["string", "null"] },
            revenue: { type: ["number", "null"] },
            grossProfit: { type: ["number", "null"] },
            operatingIncome: { type: ["number", "null"] },
            netIncome: { type: ["number", "null"] },
            eps: { type: ["number", "null"] },
            epsDiluted: { type: ["number", "null"] },
            ebitda: { type: ["number", "null"] },
          },
        },
      },
    },
  },
  example: {
    params: { symbol: "aapl", period: "annual", limit: 1 },
    request: {
      method: "GET",
      url: "https://financialmodelingprep.com/stable/income-statement?symbol=AAPL&period=annual&limit=1",
    },
    fixture: "success.json",
  },
  buildRequest: ({ symbol, period, limit }) => ({
    method: "GET",
    url: endpointUrl("https://financialmodelingprep.com/stable/income-statement", {
      symbol: symbol.toUpperCase(),
      period,
      limit,
    }),
  }),
  parse: (body, { symbol, period }) => {
    if (!Array.isArray(body)) {
      const envelope = asRecord(body, "fmp income statement");
      const message = envelope["Error Message"] ?? envelope.error ?? envelope.message;
      throw new Error(`FMP income statement error: ${String(message ?? "unexpected body")}`);
    }
    const statements = asArray(body, "fmp income statement").map((item) => {
      const row = asRecord(item, "fmp statement");
      const fiscal = optionalString(row, "fiscalYear") ?? optionalString(row, "calendarYear");
      return {
        date: optionalString(row, "date") ?? "",
        fiscalYear: fiscal,
        period: optionalString(row, "period"),
        revenue: optionalNumber(row, "revenue"),
        grossProfit: optionalNumber(row, "grossProfit"),
        operatingIncome: optionalNumber(row, "operatingIncome"),
        netIncome: optionalNumber(row, "netIncome"),
        eps: optionalNumber(row, "eps"),
        epsDiluted: optionalNumber(row, "epsDiluted", "epsdiluted"),
        ebitda: optionalNumber(row, "ebitda"),
      };
    });
    return { symbol: symbol.toUpperCase(), period, statements };
  },
});
