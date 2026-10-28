import { ToolError } from "../../../src/core/composite.js";
import { normalizeTicker } from "../../sec-edgar/lib/client.js";
import { getJson } from "./http.js";
import type { Bar } from "./indicators.js";

type Secrets = Record<string, string | undefined>;
// Tiingo free tier: 50 requests/hour, so cache generously and fetch whole years at once.
const TIINGO_GAP = 300,
  TD_GAP = 8_000; // Twelve Data free: 8 requests/minute

const tiingoSym = (t: string) => normalizeTicker(t).toLowerCase();

/** Adjusted daily bars from fromDate (YYYY-MM-DD) to latest. Tiingo first, Twelve Data fallback. */
export async function dailyBars(
  ticker: string,
  fromDate: string,
  secrets: Secrets,
  notes: string[],
): Promise<{ bars: Bar[]; source: string }> {
  // bucket start to Jan 1 so different ranges share one cached download
  const from = `${fromDate.slice(0, 4)}-01-01`;
  const errs: string[] = [];
  if (secrets.TIINGO_API_KEY) {
    try {
      const rows = await getJson<
        {
          date: string;
          adjOpen: number;
          adjHigh: number;
          adjLow: number;
          adjClose: number;
          adjVolume: number;
        }[]
      >(
        `https://api.tiingo.com/tiingo/daily/${tiingoSym(ticker)}/prices?startDate=${from}&token=${secrets.TIINGO_API_KEY}`,
        {
          cacheKey: `tiingo:daily:${tiingoSym(ticker)}:${from}`,
          ttlSec: 1_800,
          gapMs: TIINGO_GAP,
          label: "Tiingo",
        },
      );
      if (Array.isArray(rows) && rows.length) {
        return {
          source: "Tiingo (split and dividend adjusted)",
          bars: rows.map((x) => ({
            date: x.date.slice(0, 10),
            open: x.adjOpen,
            high: x.adjHigh,
            low: x.adjLow,
            close: x.adjClose,
            volume: x.adjVolume,
          })),
        };
      }
      errs.push("Tiingo returned no rows");
    } catch (e) {
      errs.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (secrets.TWELVE_DATA_API_KEY) {
    try {
      const bars = await twelveData(ticker, "1day", from, secrets);
      notes.push(`Tiingo unavailable (${errs.join("; ")}), used Twelve Data`);
      return { source: "Twelve Data (split adjusted)", bars };
    } catch (e) {
      errs.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new ToolError(
    errs.some((e) => /404|not found/i.test(e)) ? "NOT_FOUND" : "PROVIDER_ERROR",
    `No price data for ${ticker}: ${errs.join("; ") || "no price source configured"}`,
  );
}

const TIINGO_FREQ: Record<string, string> = {
  "5min": "5min",
  "15min": "15min",
  "30min": "30min",
  "1hour": "1hour",
};
const TD_FREQ: Record<string, string> = {
  "5min": "5min",
  "15min": "15min",
  "30min": "30min",
  "1hour": "1h",
};

/** Intraday bars (IEX volume only on Tiingo free, so volume is omitted). */
export async function intradayBars(
  ticker: string,
  interval: string,
  fromDate: string,
  secrets: Secrets,
  notes: string[],
): Promise<{ bars: Bar[]; source: string }> {
  const errs: string[] = [];
  if (secrets.TIINGO_API_KEY) {
    try {
      const rows = await getJson<
        { date: string; open: number; high: number; low: number; close: number }[]
      >(
        `https://api.tiingo.com/iex/${tiingoSym(ticker)}/prices?startDate=${fromDate}&resampleFreq=${TIINGO_FREQ[interval]}&token=${secrets.TIINGO_API_KEY}`,
        {
          cacheKey: `tiingo:iex:${tiingoSym(ticker)}:${fromDate}:${interval}`,
          ttlSec: 300,
          gapMs: TIINGO_GAP,
          label: "Tiingo IEX",
        },
      );
      if (Array.isArray(rows) && rows.length) {
        notes.push("Intraday bars are IEX exchange prints (regular hours), volume omitted");
        return {
          source: "Tiingo IEX",
          bars: rows.map((x) => ({
            date: x.date,
            open: x.open,
            high: x.high,
            low: x.low,
            close: x.close,
            volume: null,
          })),
        };
      }
      errs.push("Tiingo IEX returned no rows");
    } catch (e) {
      errs.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (secrets.TWELVE_DATA_API_KEY) {
    try {
      return {
        source: "Twelve Data",
        bars: await twelveData(ticker, TD_FREQ[interval], fromDate, secrets),
      };
    } catch (e) {
      errs.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new ToolError("PROVIDER_ERROR", `No intraday data for ${ticker}: ${errs.join("; ")}`);
}

async function twelveData(
  ticker: string,
  interval: string,
  from: string,
  secrets: Secrets,
): Promise<Bar[]> {
  const sym = normalizeTicker(ticker).replace("-", ".");
  const d = await getJson<{
    status?: string;
    message?: string;
    values?: {
      datetime: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume?: string;
    }[];
  }>(
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${interval}&start_date=${from}&outputsize=5000&order=ASC&apikey=${secrets.TWELVE_DATA_API_KEY}`,
    {
      cacheKey: `td:${sym}:${interval}:${from}`,
      ttlSec: interval === "1day" ? 1_800 : 300,
      gapMs: TD_GAP,
      label: "Twelve Data",
    },
  );
  if (d.status === "error" || !d.values?.length)
    throw new Error(`Twelve Data: ${d.message ?? "no values"}`);
  return d.values.map((v) => ({
    date: v.datetime,
    open: +v.open,
    high: +v.high,
    low: +v.low,
    close: +v.close,
    volume: v.volume ? +v.volume : null,
  }));
}

/** Latest IEX quote (near real time during US hours). null if unavailable. */
export async function latestQuote(
  ticker: string,
  secrets: Secrets,
): Promise<{ price: number; prevClose: number | null; timestamp: string; source: string } | null> {
  if (!secrets.TIINGO_API_KEY) return null;
  try {
    const rows = await getJson<
      { tngoLast?: number; last?: number | null; prevClose?: number; timestamp: string }[]
    >(`https://api.tiingo.com/iex/${tiingoSym(ticker)}?token=${secrets.TIINGO_API_KEY}`, {
      cacheKey: `tiingo:iexq:${tiingoSym(ticker)}`,
      ttlSec: 60,
      gapMs: TIINGO_GAP,
      label: "Tiingo IEX",
    });
    const q = rows?.[0];
    const price = q?.last ?? q?.tngoLast;
    if (!q || price == null) return null;
    return { price, prevClose: q.prevClose ?? null, timestamp: q.timestamp, source: "Tiingo IEX" };
  } catch {
    return null;
  }
}
