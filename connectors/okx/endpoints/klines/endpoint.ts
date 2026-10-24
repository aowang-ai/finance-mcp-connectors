import { z } from "zod";
import { defineEndpoint, endpointUrl } from "../../../../src/core/define.js";
import { asArray, asRecord } from "../../../../src/core/json.js";
import provider from "../../provider.js";

const bars = ["1m", "3m", "5m", "15m", "30m", "1H", "2H", "4H", "6H", "12H", "1D", "1W"] as const;

const input = z.object({
  instId: z.string().min(1).describe("Instrument id, for example BTC-USDT."),
  bar: z.enum(bars).default("1H").describe("Bar size. Default 1H."),
  limit: z.number().int().min(1).max(300).default(100).describe("Number of bars. Default 100."),
});

export default defineEndpoint({
  provider,
  name: "klines",
  meta: {
    displayName: "OKX klines",
    summary: "OHLCV candlesticks for a crypto instrument (1m..1D..1W bars).",
    description:
      "OKX candlesticks for one instrument. Bars are newest first, as OKX returns them. Volume is the base-asset size. Confirmed is false while the current bar is still open.",
    tags: ["crypto", "ohlcv", "history", "klines"],
    docsUrl: "https://www.okx.com/docs-v5/en/#order-book-trading-market-data-get-candlesticks",
  },
  input,
  outputShape: {
    type: "object",
    required: ["instId", "bar", "candles"],
    properties: {
      instId: { type: "string" },
      bar: { type: "string" },
      candles: {
        type: "array",
        items: {
          type: "object",
          required: ["ts", "open", "high", "low", "close", "volume", "confirmed"],
          properties: {
            ts: { type: "string" },
            open: { type: "string" },
            high: { type: "string" },
            low: { type: "string" },
            close: { type: "string" },
            volume: { type: "string" },
            confirmed: { type: "boolean" },
          },
        },
      },
    },
  },
  example: {
    params: { instId: "BTC-USDT", bar: "1H", limit: 2 },
    request: {
      method: "GET",
      url: "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1H&limit=2",
    },
    fixture: "recorded.json",
  },
  buildRequest: ({ instId, bar, limit }) => ({
    method: "GET",
    url: endpointUrl("https://www.okx.com/api/v5/market/candles", { instId, bar, limit }),
  }),
  parse: (body, { instId, bar }) => {
    const envelope = asRecord(body, "okx klines");
    if (envelope.code !== "0") {
      throw new Error(`OKX klines error ${String(envelope.code)}: ${String(envelope.msg ?? "")}`);
    }
    const rows = asArray(envelope.data, "okx klines data");
    const candles = rows.map((row, index) => {
      if (!Array.isArray(row) || row.length < 9) {
        throw new Error(`OKX candle ${index} is incomplete`);
      }
      const cell = (at: number) => {
        const value = row[at];
        if (value == null) throw new Error(`OKX candle ${index} column ${at} is missing`);
        return String(value);
      };
      return {
        ts: cell(0),
        open: cell(1),
        high: cell(2),
        low: cell(3),
        close: cell(4),
        volume: cell(5),
        confirmed: cell(8) === "1",
      };
    });
    return { instId, bar, candles };
  },
});
