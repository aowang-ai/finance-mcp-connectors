import { z } from "zod";
import { defineEndpoint, endpointUrl } from "../../../../src/core/define.js";
import { asArray, asRecord, requiredString } from "../../../../src/core/json.js";
import provider from "../../provider.js";

const input = z.object({
  seriesId: z.string().min(1).describe("FRED series id, for example DGS10, CPIAUCSL, or UNRATE."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe("How many observations to return, most recent first. Default 100."),
  observationStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Optional first date, YYYY-MM-DD."),
});

export default defineEndpoint({
  provider,
  name: "observations",
  meta: {
    displayName: "FRED series observations",
    summary: "Macro time series values (e.g. DGS10 10y yield, CPIAUCSL CPI, UNRATE unemployment).",
    description:
      "Observations for one FRED series. Requires FRED_API_KEY. Values are strings as FRED publishes them; a missing print is null. Results are most recent first.",
    tags: [
      "macro",
      "rates",
      "cpi",
      "inflation",
      "gdp",
      "unemployment",
      "yield",
      "treasury",
      "fed",
      "time-series",
    ],
    docsUrl: "https://fred.stlouisfed.org/docs/api/fred/series_observations.html",
  },
  input,
  outputShape: {
    type: "object",
    required: ["seriesId", "count", "observations"],
    properties: {
      seriesId: { type: "string" },
      count: { type: "integer" },
      observations: {
        type: "array",
        items: {
          type: "object",
          required: ["date", "value"],
          properties: {
            date: { type: "string" },
            value: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  example: {
    params: { seriesId: "DGS10", limit: 2 },
    request: {
      method: "GET",
      url: "https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&file_type=json&sort_order=desc&limit=2",
    },
    fixture: "success.json",
  },
  buildRequest: ({ seriesId, limit, observationStart }) => ({
    method: "GET",
    url: endpointUrl("https://api.stlouisfed.org/fred/series/observations", {
      series_id: seriesId,
      file_type: "json",
      sort_order: "desc",
      limit,
      observation_start: observationStart,
    }),
  }),
  parse: (body, { seriesId }) => {
    const envelope = asRecord(body, "fred observations");
    if (envelope.error_code) {
      throw new Error(
        `FRED error ${String(envelope.error_code)}: ${String(envelope.error_message ?? "")}`,
      );
    }
    const observations = asArray(envelope.observations, "fred observations").map((item) => {
      const row = asRecord(item, "fred observation");
      const value = requiredString(row, "value");
      return {
        date: requiredString(row, "date"),
        value: value === "." ? null : value,
      };
    });
    return {
      seriesId,
      count: typeof envelope.count === "number" ? envelope.count : observations.length,
      observations,
    };
  },
});
