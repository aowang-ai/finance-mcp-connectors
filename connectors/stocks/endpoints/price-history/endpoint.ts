import { z } from "zod";
import { defineEndpoint } from "../../../../src/core/composite.js";
import { normalizeTicker } from "../../../sec-edgar/lib/client.js";
import {
  atr,
  type Bar,
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  summarize,
  toWeekly,
} from "../../lib/indicators.js";
import { dailyBars, intradayBars } from "../../lib/prices.js";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const RANGE_DAYS: Record<string, number> = {
  "5d": 7,
  "1m": 31,
  "3m": 92,
  "6m": 183,
  "1y": 366,
  "2y": 731,
  "5y": 1827,
  "10y": 3653,
};
const r2 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 100) / 100);

export function windowStart(range: string, today: string): string {
  if (range === "ytd") return `${today.slice(0, 4)}-01-01`;
  return iso(Date.parse(today) - (RANGE_DAYS[range] ?? 183) * DAY);
}

export default defineEndpoint({
  id: "stocks#price-history",
  provider: "stocks",
  meta: {
    displayName: "Stock price history and technical indicators",
    summary:
      "Adjusted OHLCV bars for a US stock or ETF by ticker (daily, weekly or intraday) with optional indicators: SMA/EMA 20/50/200, RSI 14, MACD, Bollinger, ATR, 52-week high/low, drawdown, returns 1w/1m/3m/YTD/1y.",
    tags: [
      "equity",
      "stock",
      "etf",
      "price",
      "prices",
      "history",
      "historical",
      "ohlcv",
      "candles",
      "chart",
      "daily",
      "intraday",
      "technical",
      "technical-analysis",
      "indicators",
      "moving-average",
      "sma",
      "ema",
      "rsi",
      "macd",
      "bollinger",
      "atr",
      "returns",
      "52-week",
      "drawdown",
      "trend",
    ],
  },
  request: { method: "GET", path: "/tiingo/daily" },
  input: z.object({
    ticker: z.string().min(1).describe("US stock or ETF ticker, e.g. SNDK, MU, SPY"),
    range: z
      .enum(["5d", "1m", "3m", "6m", "ytd", "1y", "2y", "5y", "10y"])
      .default("6m")
      .describe("lookback window, ignored if start is set"),
    start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("YYYY-MM-DD, overrides range"),
    end: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("YYYY-MM-DD, default latest"),
    interval: z
      .enum(["daily", "weekly", "1hour", "30min", "15min", "5min"])
      .default("daily")
      .describe("intraday intervals cover recent sessions only"),
    indicators: z
      .boolean()
      .default(true)
      .describe("add indicator columns per bar and a summary block"),
    maxBars: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(260)
      .describe("keep only the most recent N bars in the output"),
  }),
  usage: { kind: "PER_CALL", credits: 1 },
  execute: async (input, { secrets }) => {
    const notes: string[] = [];
    const today = iso(Date.now());
    const end = input.end ?? today;
    const start = input.start ?? windowStart(input.range, end);
    const ticker = normalizeTicker(input.ticker);

    if (!["daily", "weekly"].includes(input.interval)) {
      const from = input.start ?? iso(Math.max(Date.parse(start), Date.now() - 30 * DAY));
      const { bars, source } = await intradayBars(ticker, input.interval, from, secrets, notes);
      const w = bars
        .filter((b) => b.date.slice(0, 10) >= from && b.date.slice(0, 10) <= end)
        .slice(-input.maxBars);
      return {
        ticker,
        interval: input.interval,
        source,
        count: w.length,
        bars: w.map((b) => ({
          t: b.date,
          o: r2(b.open),
          h: r2(b.high),
          l: r2(b.low),
          c: r2(b.close),
        })),
        notes,
      };
    }

    // fetch ~300 trading days before the window so 200-day indicators are warm
    const fetchFrom = iso(Date.parse(start) - 420 * DAY);
    const { bars: all, source } = await dailyBars(ticker, fetchFrom, secrets, notes);
    let series: Bar[] = all.filter((b) => b.date <= end);
    if (input.interval === "weekly") series = toWeekly(series);
    const c = series.map((b) => b.close);
    const ind = input.indicators
      ? {
          s20: sma(c, 20),
          s50: sma(c, 50),
          s200: sma(c, 200),
          e20: ema(c, 20),
          rsi: rsi(c),
          macd: macd(c),
          bb: bollinger(c),
          atr: atr(series),
        }
      : null;
    const rows = [];
    for (let i = 0; i < series.length; i++) {
      const b = series[i];
      if (b.date < start) continue;
      const row: Record<string, unknown> = {
        t: b.date,
        o: r2(b.open),
        h: r2(b.high),
        l: r2(b.low),
        c: r2(b.close),
        v: b.volume == null ? null : Math.round(b.volume),
      };
      if (ind)
        Object.assign(row, {
          sma20: r2(ind.s20[i]),
          sma50: r2(ind.s50[i]),
          sma200: r2(ind.s200[i]),
          ema20: r2(ind.e20[i]),
          rsi14: r2(ind.rsi[i]),
          macd: r2(ind.macd[i].macd),
          macdSignal: r2(ind.macd[i].signal),
          bbUpper: r2(ind.bb[i].upper),
          bbLower: r2(ind.bb[i].lower),
          atr14: r2(ind.atr[i]),
        });
      rows.push(row);
    }
    if (!rows.length)
      notes.push(
        `No bars between ${start} and ${end}${all.length ? ` (history starts ${all[0].date})` : ""}`,
      );
    else if (all[0].date > start)
      notes.push(`History starts ${all[0].date} (listing or spinoff date)`);
    const kept = rows.slice(-input.maxBars);
    if (kept.length < rows.length)
      notes.push(
        `Showing the last ${kept.length} of ${rows.length} bars; raise maxBars or narrow the range for more`,
      );
    return {
      ticker,
      interval: input.interval,
      start,
      end,
      source,
      count: kept.length,
      ...(input.indicators && input.interval === "daily"
        ? { summary: summarize(all.filter((b) => b.date <= end)) }
        : {}),
      bars: kept,
      notes,
    };
  },
  outputHint:
    "{ ticker, interval, start, end, source, count, summary?: { asOf, close, returns{1w,1m,3m,ytd,1y}, week52{high,low,positionInRange,offHigh}, drawdown, sma{20,50,200}, ema, rsi14, macd, bollinger20, atr14, trend[] }, bars: [{ t, o, h, l, c, v, sma20?, sma50?, sma200?, ema20?, rsi14?, macd?, macdSignal?, bbUpper?, bbLower?, atr14? }], notes }",
});
