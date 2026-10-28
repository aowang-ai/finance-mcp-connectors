import { defineProvider } from "../../src/core/define.js";

export default defineProvider({
  name: "macro",
  meta: {
    displayName: "US macro",
    summary:
      "One-call US macro dashboard built on FRED: policy rate, Treasury yields and curve, inflation, jobs, growth, volatility and the dollar.",
    homepageUrl: "https://fred.stlouisfed.org",
    docsUrl: "https://fred.stlouisfed.org/docs/api/fred/series_observations.html",
  },
  auth: { kind: "query", env: "FRED_API_KEY", param: "api_key" },
});
