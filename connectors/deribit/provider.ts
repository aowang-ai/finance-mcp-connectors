import { defineProvider } from "../../src/core/define.js";

export default defineProvider({
  name: "deribit",
  meta: {
    displayName: "Deribit",
    summary: "Public crypto options instruments.",
    homepageUrl: "https://www.deribit.com",
    docsUrl: "https://docs.deribit.com/",
  },
  auth: { kind: "none" },
});
