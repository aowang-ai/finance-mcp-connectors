import { z } from "zod";
import { defineEndpoint } from "../../../../src/core/composite.js";
import { filingUrls, resolveTicker, secFetch } from "../../lib/client.js";
import { type Form4Summary, parseForm4, summarizeInsiders } from "../../lib/form4.js";

interface Submissions {
  cik?: string;
  name?: string;
  tickers?: string[];
  exchanges?: string[];
  sicDescription?: string;
  fiscalYearEnd?: string;
  filings?: { recent?: Record<string, (string | number)[]> };
}

/** "10-K" matches 10-K and 10-K/A; "13F" matches 13F-HR etc; "4" matches 4 and 4/A only. */
export function formMatches(form: string, filters: string[]): boolean {
  const f = form.toUpperCase();
  return filters.some((raw) => {
    const q = raw.trim().toUpperCase();
    if (!q) return false;
    if (f === q || f === `${q}/A`) return true;
    return /[A-Z]$/.test(q) && q.length >= 3 && f.startsWith(q);
  });
}

/** Composite: ticker -> CIK -> submissions index (+ parsed recent Form 4s). */
export default defineEndpoint({
  id: "sec-edgar#filings",
  provider: "sec-edgar",
  meta: {
    displayName: "Company filings and insider trades (SEC)",
    summary:
      "Recent SEC filings for a US stock by ticker (10-K, 10-Q, 8-K, Form 4, 13F, S-1, DEF 14A...) with document links, plus a summary of recent Form 4 insider buys and sells. No key.",
    tags: [
      "equity",
      "stock",
      "filings",
      "sec",
      "edgar",
      "10-k",
      "10-q",
      "8-k",
      "annual-report",
      "quarterly-report",
      "insider",
      "insider-trading",
      "form-4",
      "13f",
      "proxy",
      "events",
      "disclosures",
    ],
  },
  request: { method: "GET", path: "/submissions" },
  input: z.object({
    ticker: z
      .string()
      .min(1)
      .describe("US stock ticker, e.g. AAPL, MU, SNDK. A CIK number also works."),
    forms: z
      .array(z.string())
      .optional()
      .describe(
        'form types to keep, e.g. ["10-K","10-Q","8-K"] or ["4"]; amendments (/A) included. Omit for all.',
      ),
    limit: z.number().int().min(1).max(100).default(20).describe("max filings returned"),
    insiderLimit: z
      .number()
      .int()
      .min(0)
      .max(15)
      .default(8)
      .describe(
        "how many of the latest Form 4 filings to parse into an insider summary (0 to skip)",
      ),
  }),
  usage: { kind: "PER_CALL", credits: 1 },
  execute: async (input, { secrets }) => {
    const ref = await resolveTicker(input.ticker, secrets);
    const sub = await secFetch<Submissions>(`https://data.sec.gov/submissions/CIK${ref.cik}.json`, {
      ttlSec: 900,
      secrets,
      memo: false,
    });
    const r = sub.filings?.recent ?? {};
    const n = (r.accessionNumber ?? []).length;
    const all = [];
    for (let i = 0; i < n; i++) {
      all.push({
        form: String(r.form?.[i] ?? ""),
        filingDate: String(r.filingDate?.[i] ?? ""),
        reportDate: (r.reportDate?.[i] as string) || undefined,
        accessionNumber: String(r.accessionNumber?.[i]),
        primaryDocument: (r.primaryDocument?.[i] as string) || undefined,
        description: (r.primaryDocDescription?.[i] as string) || undefined,
        items: (r.items?.[i] as string) || undefined,
      });
    }
    const filtered = input.forms?.length
      ? all.filter((f) => formMatches(f.form, input.forms!))
      : all;
    const filings = filtered
      .slice(0, input.limit)
      .map((f) => ({ ...f, ...filingUrls(ref.cikInt, f.accessionNumber, f.primaryDocument) }));

    let insider: unknown;
    const wantInsider =
      input.insiderLimit > 0 && (!input.forms?.length || formMatches("4", input.forms));
    if (wantInsider) {
      const f4s = all
        .filter((f) => f.form === "4" || f.form === "4/A")
        .slice(0, input.insiderLimit);
      const parsed: (Form4Summary & {
        filingDate: string;
        accessionNumber: string;
        indexUrl: string;
      })[] = [];
      const errors: string[] = [];
      for (const f of f4s) {
        // primaryDocument is the XSL-rendered path (xslF345X06/form4.xml); the raw XML sits at the bare filename
        const xmlName = (f.primaryDocument ?? "").split("/").pop();
        if (!xmlName?.endsWith(".xml")) continue;
        const { indexUrl } = filingUrls(ref.cikInt, f.accessionNumber);
        const url = `https://www.sec.gov/Archives/edgar/data/${ref.cikInt}/${f.accessionNumber.replace(/-/g, "")}/${xmlName}`;
        try {
          const xml = await secFetch<string>(url, {
            ttlSec: 604_800,
            secrets,
            as: "text",
            memo: false,
          });
          parsed.push({
            ...parseForm4(xml),
            filingDate: f.filingDate,
            accessionNumber: f.accessionNumber,
            indexUrl,
          });
        } catch (e) {
          errors.push(`${f.accessionNumber}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      insider = {
        filingsParsed: parsed.length,
        window: parsed.length
          ? { from: parsed[parsed.length - 1].filingDate, to: parsed[0].filingDate }
          : null,
        ...summarizeInsiders(parsed),
        recent: parsed.map((p) => ({
          filingDate: p.filingDate,
          owner: p.owner,
          roles: p.roles,
          officerTitle: p.officerTitle,
          tenb5_1Plan: p.tenb5_1,
          transactions: p.transactions
            .filter((t) => !t.derivative)
            .map((t) => ({
              date: t.date,
              code: t.code,
              type: t.codeLabel,
              shares: t.shares,
              price: t.price,
              value: t.value,
              sharesOwnedAfter: t.sharesOwnedAfter,
            })),
          derivativeTransactions: p.transactions.filter((t) => t.derivative).length,
          url: p.indexUrl,
        })),
        ...(errors.length ? { errors } : {}),
      };
    }
    return {
      ticker: ref.ticker,
      cik: ref.cik,
      name: sub.name ?? ref.name,
      exchanges: sub.exchanges,
      industry: sub.sicDescription,
      fiscalYearEnd: sub.fiscalYearEnd,
      totalMatched: filtered.length,
      filings,
      ...(insider ? { insider } : {}),
      source: "SEC EDGAR submissions",
      sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ref.cik}`,
    };
  },
  outputHint:
    "{ ticker, cik, name, industry, filings: [{ form, filingDate, reportDate, accessionNumber, description, items, indexUrl, documentUrl }], insider?: { filingsParsed, window, openMarketBuys{transactions,shares,value}, openMarketSales{...}, netShares, recent: [{ filingDate, owner, roles, officerTitle, tenb5_1Plan, transactions:[{date,code,type,shares,price,value,sharesOwnedAfter}], url }] } }",
});
