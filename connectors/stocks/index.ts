import { composite } from "../../src/core/composite.js";
import news from "./endpoints/news/endpoint.js";
import priceHistory from "./endpoints/price-history/endpoint.js";
import snapshot from "./endpoints/snapshot/endpoint.js";
import provider from "./provider.js";

const docsUrl = "https://finance-mcp.com/docs";
const object = (required: string[]) => ({ type: "object", required });

export const endpoints = [
  composite(provider, snapshot, {
    description:
      "Composite. Tiingo daily bars and IEX quote, SEC company_tickers and XBRL companyfacts for TTM valuation, Finnhub profile, recommendations, price target, earnings calendar and peers. Finnhub parts are optional and become notes when missing. Prices are delayed or IEX only.",
    docsUrl,
    outputShape: object(["ticker", "price", "notes"]),
    example: {
      params: { ticker: "SNDK" },
      request: { method: "GET", url: "https://api.tiingo.com/tiingo/daily/sndk/prices" },
      fixture: "recorded.json",
    },
    envs: {
      required: [],
      optional: [
        "TIINGO_API_KEY",
        "TWELVE_DATA_API_KEY",
        "FINNHUB_API_KEY",
        "SEC_EDGAR_USER_AGENT",
      ],
    },
  }),
  composite(provider, priceHistory, {
    description:
      "Composite. Adjusted bars from Tiingo, Twelve Data as fallback, with SMA, EMA, RSI, MACD, Bollinger and ATR computed locally. Intraday uses Tiingo IEX.",
    docsUrl,
    outputShape: object(["ticker", "bars"]),
    example: {
      params: { ticker: "MU", range: "3m", maxBars: 5 },
      request: { method: "GET", url: "https://api.tiingo.com/tiingo/daily/mu/prices" },
      fixture: "recorded.json",
    },
    envs: { required: [], optional: ["TIINGO_API_KEY", "TWELVE_DATA_API_KEY"] },
  }),
  composite(provider, news, {
    description:
      "Composite. Finnhub company-news for the window, deduplicated by link and headline and capped, plus the next earnings date from the Finnhub earnings calendar. Without a ticker, Finnhub general market news.",
    docsUrl: "https://finnhub.io/docs/api/company-news",
    outputShape: object(["mode", "count", "items", "notes"]),
    example: {
      params: { ticker: "SNDK", limit: 5 },
      request: { method: "GET", url: "https://finnhub.io/api/v1/company-news?symbol=SNDK" },
      fixture: "recorded.json",
    },
    envs: { required: ["FINNHUB_API_KEY"], optional: [] },
  }),
];
