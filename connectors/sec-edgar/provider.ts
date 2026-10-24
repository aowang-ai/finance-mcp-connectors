import { defineProvider } from "../../src/core/define.js";

export const DEFAULT_SEC_USER_AGENT = "finance-mcp-connectors admin@finance-mcp.com";

export default defineProvider({
  name: "sec-edgar",
  meta: {
    displayName: "SEC EDGAR",
    summary: "US company filing index from the SEC submissions API.",
    homepageUrl: "https://www.sec.gov/edgar",
    docsUrl: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
  },
  auth: {
    kind: "header",
    env: "SEC_EDGAR_USER_AGENT",
    header: "User-Agent",
    defaultValue: DEFAULT_SEC_USER_AGENT,
  },
});
