import { defineProvider } from "../../src/core/define.js";

export default defineProvider({
  name: "okx",
  meta: {
    displayName: "OKX",
    summary: "Public crypto spot and swap market data.",
    homepageUrl: "https://www.okx.com",
    docsUrl: "https://www.okx.com/docs-v5/en/#order-book-trading-market-data",
  },
  auth: { kind: "none" },
});
