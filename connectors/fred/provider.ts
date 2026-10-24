import { defineProvider } from "../../src/core/define.js";

export default defineProvider({
  name: "fred",
  meta: {
    displayName: "FRED",
    summary: "Federal Reserve Economic Data series.",
    homepageUrl: "https://fred.stlouisfed.org",
    docsUrl: "https://fred.stlouisfed.org/docs/api/fred/series_observations.html",
  },
  auth: { kind: "query", env: "FRED_API_KEY", param: "api_key" },
});
