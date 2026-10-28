import { defineProvider } from "../../src/core/define.js";

export default defineProvider({
  name: "stocks",
  meta: {
    displayName: "US stocks",
    summary:
      "Ticker-based composite stock tools: snapshot, price history with indicators, and company news. Prices from Tiingo (Twelve Data fallback), fundamentals from SEC XBRL, analysts, earnings dates, peers and news from Finnhub.",
    homepageUrl: "https://finance-mcp.com",
    docsUrl: "https://finance-mcp.com/docs",
  },
  auth: { kind: "none" },
});
