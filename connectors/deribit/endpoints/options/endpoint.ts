import { z } from "zod";
import { defineEndpoint, endpointUrl } from "../../../../src/core/define.js";
import { asArray, asRecord, optionalString, requiredString } from "../../../../src/core/json.js";
import provider from "../../provider.js";

const input = z.object({
  currency: z.enum(["BTC", "ETH"]).describe("Option currency, BTC or ETH."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe("Maximum instruments to return, soonest expiry first. Default 100."),
});

export default defineEndpoint({
  provider,
  name: "options",
  meta: {
    displayName: "Deribit option chain",
    summary:
      "Full BTC/ETH option chain (strikes, expiries, kind) from the largest crypto options market.",
    description:
      "Lists live Deribit option instruments for BTC or ETH: name, strike, expiry, and call or put. Results are soonest expiry first and capped by limit (default 100). count is the full chain length.",
    tags: ["crypto", "options", "derivatives"],
    docsUrl: "https://docs.deribit.com/#public-get_instruments",
  },
  input,
  outputShape: {
    type: "object",
    required: ["currency", "count", "truncated", "instruments"],
    properties: {
      currency: { type: "string" },
      count: { type: "integer" },
      truncated: { type: "boolean" },
      instruments: {
        type: "array",
        items: {
          type: "object",
          required: ["instrumentName", "strike", "expiration", "optionType"],
          properties: {
            instrumentName: { type: "string" },
            strike: { type: "number" },
            expiration: { type: "string" },
            optionType: { type: "string" },
            settlementPeriod: { type: "string" },
          },
        },
      },
    },
  },
  example: {
    params: { currency: "BTC", limit: 2 },
    request: {
      method: "GET",
      url: "https://www.deribit.com/api/v2/public/get_instruments?currency=BTC&kind=option&expired=false",
    },
    fixture: "recorded.json",
  },
  buildRequest: ({ currency }) => ({
    method: "GET",
    url: endpointUrl("https://www.deribit.com/api/v2/public/get_instruments", {
      currency,
      kind: "option",
      expired: "false",
    }),
  }),
  parse: (body, { currency, limit }) => {
    const envelope = asRecord(body, "deribit options");
    if (envelope.error) {
      throw new Error(`Deribit error: ${JSON.stringify(envelope.error).slice(0, 300)}`);
    }
    const rows = asArray(envelope.result, "deribit result").map((item) =>
      asRecord(item, "deribit instrument"),
    );
    const instruments = rows
      .map((row) => {
        const expirationMs = row.expiration_timestamp;
        const strike = row.strike;
        if (typeof expirationMs !== "number" || typeof strike !== "number") {
          throw new Error(`Deribit instrument ${String(row.instrument_name)} is missing fields`);
        }
        return {
          instrumentName: requiredString(row, "instrument_name"),
          strike,
          expiration: new Date(expirationMs).toISOString(),
          expirationMs,
          optionType: requiredString(row, "option_type"),
          settlementPeriod: optionalString(row, "settlement_period"),
        };
      })
      .sort((a, b) => a.expirationMs - b.expirationMs || a.strike - b.strike);
    return {
      currency,
      count: instruments.length,
      truncated: instruments.length > limit,
      instruments: instruments.slice(0, limit).map((item) => ({
        instrumentName: item.instrumentName,
        strike: item.strike,
        expiration: item.expiration,
        optionType: item.optionType,
        settlementPeriod: item.settlementPeriod,
      })),
    };
  },
});
