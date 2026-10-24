import { z } from "zod";
import { defineEndpoint } from "../../../../src/core/define.js";
import { asRecord, parallelStrings } from "../../../../src/core/json.js";
import provider from "../../provider.js";

const input = z.object({
  cik: z.string().min(1).describe("CIK, with or without leading zeros. Example: 0000320193."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Recent filings to return. Default 20."),
});

export function normalizeCik(cik: string): string {
  const digits = cik.replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 10) throw new Error("cik must be 1 to 10 digits");
  return digits.padStart(10, "0");
}

export default defineEndpoint({
  provider,
  name: "submissions",
  meta: {
    displayName: "SEC company filings",
    summary:
      "Filing index for a US company by CIK (10-K/10-Q/8-K with accession numbers, dates, primary docs).",
    description:
      "Recent SEC EDGAR submissions for one CIK: form type, filing date, accession number, and primary document. Includes 10-K, 10-Q, 8-K, and other forms in the recent index. Set SEC_EDGAR_USER_AGENT to a contact string if you want to replace the default.",
    tags: ["equity", "filings", "fundamentals", "10-k", "10-q", "8-k", "annual-report"],
    docsUrl: "https://data.sec.gov/submissions/",
  },
  input,
  outputShape: {
    type: "object",
    required: ["cik", "name", "tickers", "filings"],
    properties: {
      cik: { type: "string" },
      name: { type: "string" },
      tickers: { type: "array", items: { type: "string" } },
      exchanges: { type: "array", items: { type: "string" } },
      filings: {
        type: "array",
        items: {
          type: "object",
          required: ["form", "filingDate", "accessionNumber", "primaryDocument"],
          properties: {
            form: { type: "string" },
            filingDate: { type: "string" },
            reportDate: { type: "string" },
            accessionNumber: { type: "string" },
            primaryDocument: { type: "string" },
            primaryDocDescription: { type: "string" },
          },
        },
      },
    },
  },
  example: {
    params: { cik: "0000320193", limit: 2 },
    request: {
      method: "GET",
      url: "https://data.sec.gov/submissions/CIK0000320193.json",
    },
    fixture: "recorded.json",
  },
  buildRequest: ({ cik }) => ({
    method: "GET",
    url: `https://data.sec.gov/submissions/CIK${normalizeCik(cik)}.json`,
  }),
  parse: (body, { limit }) => {
    const envelope = asRecord(body, "sec submissions");
    const filings = asRecord(envelope.filings, "sec filings");
    const recent = asRecord(filings.recent, "sec filings.recent");
    const forms = parallelStrings(recent, "form");
    const filingDates = parallelStrings(recent, "filingDate");
    const reportDates = parallelStrings(recent, "reportDate");
    const accessions = parallelStrings(recent, "accessionNumber");
    const documents = parallelStrings(recent, "primaryDocument");
    const descriptions = parallelStrings(recent, "primaryDocDescription");
    const count = Math.min(limit, forms.length);
    return {
      cik: String(envelope.cik ?? ""),
      name: typeof envelope.name === "string" ? envelope.name : "",
      tickers: parallelStrings(envelope, "tickers"),
      exchanges: parallelStrings(envelope, "exchanges"),
      filings: Array.from({ length: count }, (_, index) => ({
        form: forms[index] ?? "",
        filingDate: filingDates[index] ?? "",
        reportDate: reportDates[index] ?? "",
        accessionNumber: accessions[index] ?? "",
        primaryDocument: documents[index] ?? "",
        primaryDocDescription: descriptions[index] ?? "",
      })),
    };
  },
});
