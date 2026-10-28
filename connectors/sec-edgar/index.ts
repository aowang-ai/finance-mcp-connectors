import { composite } from "../../src/core/composite.js";
import filings from "./endpoints/filings/endpoint.js";
import fundamentals from "./endpoints/fundamentals/endpoint.js";
import submissions from "./endpoints/submissions/endpoint.js";
import provider from "./provider.js";

export const endpoints = [
  composite(provider, fundamentals, {
    description:
      "Composite. Ticker to CIK through SEC company_tickers.json, then XBRL companyfacts normalized into income statement, balance sheet and cash flow lines with margins and growth. Quarterly cash flow is derived from year-to-date figures.",
    docsUrl: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
    outputShape: { type: "object", required: ["ticker", "cik", "periods", "notes"] },
    example: {
      params: { ticker: "SNDK", period: "quarterly", limit: 2 },
      request: { method: "GET", url: "https://www.sec.gov/files/company_tickers.json" },
      fixture: "recorded.json",
    },
    envs: { required: [], optional: ["SEC_EDGAR_USER_AGENT"] },
  }),
  composite(provider, filings, {
    description:
      "Composite. Ticker to CIK, the submissions filing index filtered by form, and the latest Form 4 XML documents parsed into an insider buy and sell summary.",
    docsUrl: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
    outputShape: { type: "object", required: ["ticker", "cik", "filings"] },
    example: {
      params: { ticker: "MU", limit: 5, insiderLimit: 2 },
      request: { method: "GET", url: "https://www.sec.gov/files/company_tickers.json" },
      fixture: "recorded.json",
    },
    envs: { required: [], optional: ["SEC_EDGAR_USER_AGENT"] },
  }),
  submissions,
];
