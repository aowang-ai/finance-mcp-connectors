import { composite } from "../../src/core/composite.js";
import overview from "./endpoints/overview/endpoint.js";
import provider from "./provider.js";

export const endpoints = [
  composite(provider, overview, {
    description:
      "Composite. One FRED observations call per indicator (DFF, DGS2, DGS10, T10Y2Y, CPIAUCSL, PCEPILFE, UNRATE, A191RL1Q225SBEA, VIXCLS, DTWEXBGS). CPI and core PCE are turned into YoY percent. Trend compares the latest reading with about 3 months earlier.",
    docsUrl: "https://fred.stlouisfed.org/docs/api/fred/series_observations.html",
    outputShape: { type: "object", required: ["asOf", "indicators", "highlights", "notes"] },
    example: {
      params: { series: ["treasury2y", "treasury10y", "spread10y2y", "cpiYoY"] },
      request: {
        method: "GET",
        url: "https://api.stlouisfed.org/fred/series/observations?series_id=DGS2",
      },
      fixture: "recorded.json",
    },
    envs: { required: ["FRED_API_KEY"], optional: [] },
  }),
];
