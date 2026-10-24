import { z } from "zod";
import { defineEndpoint, endpointUrl } from "../../../../src/core/define.js";
import { asArray, asRecord, requiredString } from "../../../../src/core/json.js";
import provider from "../../provider.js";

const input = z.object({
  instId: z.string().min(1).describe("Instrument id, for example BTC-USDT or BTC-USDT-SWAP."),
});

export default defineEndpoint({
  provider,
  name: "ticker",
  meta: {
    displayName: "OKX ticker",
    summary: "24h ticker (last price, high/low, volume) for a crypto instrument like BTC-USDT.",
    description:
      "Latest OKX ticker for one spot or swap instrument: last price, bid, ask, 24h high and low, and 24h volume. Example: instId BTC-USDT.",
    tags: ["crypto", "spot", "ticker", "realtime"],
    docsUrl: "https://www.okx.com/docs-v5/en/#order-book-trading-market-data-get-ticker",
  },
  input,
  outputShape: {
    type: "object",
    required: ["instId", "last", "bid", "ask", "high24h", "low24h", "vol24h", "ts"],
    properties: {
      instId: { type: "string" },
      last: { type: "string" },
      bid: { type: "string" },
      ask: { type: "string" },
      high24h: { type: "string" },
      low24h: { type: "string" },
      open24h: { type: "string" },
      vol24h: { type: "string" },
      volCcy24h: { type: "string" },
      ts: { type: "string" },
    },
  },
  example: {
    params: { instId: "BTC-USDT" },
    request: {
      method: "GET",
      url: "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
    },
    fixture: "recorded.json",
  },
  buildRequest: ({ instId }) => ({
    method: "GET",
    url: endpointUrl("https://www.okx.com/api/v5/market/ticker", { instId }),
  }),
  parse: (body) => {
    const envelope = asRecord(body, "okx ticker");
    if (envelope.code !== "0") {
      throw new Error(`OKX ticker error ${String(envelope.code)}: ${String(envelope.msg ?? "")}`);
    }
    const row = asRecord(asArray(envelope.data, "okx ticker data")[0], "okx ticker row");
    return {
      instId: requiredString(row, "instId"),
      last: requiredString(row, "last"),
      bid: requiredString(row, "bidPx"),
      ask: requiredString(row, "askPx"),
      high24h: requiredString(row, "high24h"),
      low24h: requiredString(row, "low24h"),
      open24h: requiredString(row, "open24h"),
      vol24h: requiredString(row, "vol24h"),
      volCcy24h: requiredString(row, "volCcy24h"),
      ts: requiredString(row, "ts"),
    };
  },
});
