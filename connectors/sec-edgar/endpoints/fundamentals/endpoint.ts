import { z } from "zod";
import { defineEndpoint, ToolError } from "../../../../src/core/composite.js";
import { resolveTicker, secFetch } from "../../lib/client.js";
import { type CompanyFacts, normalizeFundamentals } from "../../lib/xbrl.js";

/** Composite: ticker -> CIK -> XBRL companyfacts -> normalized statements. */
export default defineEndpoint({
  id: "sec-edgar#fundamentals",
  provider: "sec-edgar",
  meta: {
    displayName: "Company fundamentals (SEC XBRL)",
    summary:
      "Income statement, balance sheet and cash flow key lines for a US stock by ticker, annual or quarterly, with margins, YoY growth, free cash flow, debt and source filing links. From SEC XBRL filings, no key.",
    tags: [
      "equity",
      "stock",
      "fundamentals",
      "financials",
      "financial-statements",
      "income-statement",
      "balance-sheet",
      "cash-flow",
      "revenue",
      "earnings",
      "eps",
      "margins",
      "growth",
      "free-cash-flow",
      "debt",
      "10-k",
      "10-q",
      "quarterly",
      "annual",
      "valuation",
    ],
  },
  request: { method: "GET", path: "/api/xbrl/companyfacts" },
  input: z.object({
    ticker: z
      .string()
      .min(1)
      .describe(
        "US stock ticker, e.g. AAPL, MU, SNDK (BRK.B or BRK-B both work). A CIK number also works.",
      ),
    period: z
      .enum(["annual", "quarterly"])
      .default("annual")
      .describe("annual (fiscal years) or quarterly (Q4 derived from the annual report)"),
    limit: z.number().int().min(1).max(20).default(4).describe("number of most recent periods"),
  }),
  usage: { kind: "PER_CALL", credits: 1 },
  execute: async (input, { secrets }) => {
    const ref = await resolveTicker(input.ticker, secrets);
    let cf: CompanyFacts;
    try {
      cf = await secFetch<CompanyFacts>(
        `https://data.sec.gov/api/xbrl/companyfacts/CIK${ref.cik}.json`,
        { ttlSec: 21_600, secrets, memo: false },
      );
    } catch (e) {
      if (e instanceof ToolError && e.code === "NOT_FOUND")
        throw new ToolError(
          "NOT_FOUND",
          `${ref.ticker} has no XBRL financial data at the SEC (foreign filers on 20-F/40-F and funds are often missing).`,
        );
      throw e;
    }
    const { periods, availablePeriods } = normalizeFundamentals(
      cf,
      input.period,
      input.limit,
      ref.cikInt,
    );
    const notes: string[] = [
      "Values in USD (EPS in USD per share). Ratios and growth are fractions (0.25 = 25%).",
      "freeCashFlow = operatingCashFlow - capex. Quarterly cash flow is derived from year-to-date figures.",
    ];
    if (availablePeriods < input.limit)
      notes.push(
        `Only ${availablePeriods} ${input.period} periods are tagged in SEC XBRL (short filing history, e.g. a recent spinoff or IPO; earlier years may appear only as comparatives).`,
      );
    return {
      ticker: ref.ticker,
      cik: ref.cik,
      name: cf.entityName ?? ref.name,
      period: input.period,
      source: "SEC XBRL companyfacts",
      sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${ref.cik}.json`,
      periods,
      notes,
    };
  },
  outputHint:
    "{ ticker, cik, name, period, periods: [{ fiscalYear, fiscalPeriod, periodStart, periodEnd, form, accession, filingUrl, income{revenue,costOfRevenue,grossProfit,researchAndDevelopment,operatingIncome,netIncome,epsDiluted,sharesDiluted}, balance{totalAssets,totalLiabilities,totalEquity,cash,shortTermInvestments,totalDebt,netDebt,sharesOutstanding}, cashFlow{operatingCashFlow,capex,freeCashFlow,dividendsPaid,buybacks}, ratios{grossMargin,operatingMargin,netMargin,fcfMargin,debtToEquity,returnOnEquity}, growth{revenueYoY,netIncomeYoY,epsDilutedYoY,freeCashFlowYoY,revenueQoQ?} }], notes }",
});
