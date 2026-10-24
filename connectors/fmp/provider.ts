import { defineProvider } from "../../src/core/define.js";

export default defineProvider({
  name: "fmp",
  meta: {
    displayName: "FMP",
    summary: "Financial Modeling Prep company financials.",
    homepageUrl: "https://site.financialmodelingprep.com",
    docsUrl: "https://site.financialmodelingprep.com/developer/docs",
  },
  auth: { kind: "query", env: "FMP_API_KEY", param: "apikey" },
});
