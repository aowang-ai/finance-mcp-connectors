import { defineProvider } from "../../src/core/define.js";

export default defineProvider({
  name: "polymarket",
  meta: {
    displayName: "Polymarket",
    summary: "Public prediction-market events from the Gamma API.",
    homepageUrl: "https://polymarket.com",
    docsUrl: "https://docs.polymarket.com/developers/gamma-markets-api/get-events",
  },
  auth: { kind: "none" },
});
