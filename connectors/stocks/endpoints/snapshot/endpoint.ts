import { z } from "zod";
import { defineEndpoint } from "../../../../src/core/composite.js";
import { normalizeTicker, resolveTicker, secFetch } from "../../../sec-edgar/lib/client.js";
import { type CompanyFacts, normalizeFundamentals } from "../../../sec-edgar/lib/xbrl.js";
import { fhSym, finnhub } from "../../lib/finnhub.js";
import { summarize } from "../../lib/indicators.js";
import { dailyBars, latestQuote } from "../../lib/prices.js";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const r = (x: number | null | undefined, dp = 2) =>
  x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** dp) / 10 ** dp;
const div = (a?: number | null, b?: number | null) =>
  a == null || b == null || b <= 0 ? null : a / b;

/** Trailing twelve months from the last four quarters (null if any is missing). */
export function ttm(
  qs: { income: Record<string, number | null>; cashFlow: Record<string, number | null> }[],
  key: string,
  block: "income" | "cashFlow",
) {
  if (qs.length < 4) return null;
  let s = 0;
  for (const q of qs.slice(0, 4)) {
    const v = q[block][key];
    if (v == null) return null;
    s += v;
  }
  return s;
}

export default defineEndpoint({
  id: "stocks#snapshot",
  provider: "stocks",
  meta: {
    displayName: "Stock snapshot: where is this stock now",
    summary:
      "One call for a US stock by ticker: latest price and change, 52-week range position, returns, trend and key indicators, valuation (market cap, P/E, P/S, EV/sales, FCF yield) from SEC fundamentals, profile, analyst ratings, next earnings date and peers when available.",
    tags: [
      "equity",
      "stock",
      "snapshot",
      "overview",
      "quote",
      "price",
      "valuation",
      "market-cap",
      "pe",
      "p/e",
      "ev",
      "analyst",
      "recommendation",
      "price-target",
      "earnings-date",
      "peers",
      "profile",
      "industry",
      "52-week",
      "trend",
      "technical",
      "fundamentals",
      "where-is",
    ],
  },
  request: { method: "GET", path: "/snapshot" },
  input: z.object({
    ticker: z.string().min(1).describe("US stock ticker, e.g. SNDK, MU, AAPL"),
  }),
  usage: { kind: "PER_CALL", credits: 1 },
  execute: async (input, { secrets }) => {
    const notes: string[] = [];
    const ticker = normalizeTicker(input.ticker);
    const sym = fhSym(ticker);

    const ref = await resolveTicker(ticker, secrets).catch(() => null);
    const [prices, quote, facts] = await Promise.all([
      dailyBars(ticker, iso(Date.now() - 2 * 366 * DAY), secrets, notes),
      latestQuote(ticker, secrets),
      ref
        ? secFetch<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${ref.cik}.json`, {
            ttlSec: 21_600,
            secrets,
            memo: false,
          }).catch((e) => {
            notes.push(`SEC fundamentals unavailable (${e instanceof Error ? e.message : e})`);
            return null;
          })
        : Promise.resolve(null),
    ]);
    if (!ref) notes.push("Not an SEC registrant ticker, so no valuation from filings");

    const tech = summarize(prices.bars);
    const lastBar = prices.bars[prices.bars.length - 1];
    const prevBar = prices.bars[prices.bars.length - 2];
    const useQuote = quote && quote.timestamp.slice(0, 10) >= lastBar.date;
    const price = useQuote ? quote?.price : lastBar.close;
    const prevClose = useQuote ? (quote?.prevClose ?? lastBar.close) : (prevBar?.close ?? null);

    // ---- valuation from SEC ----
    let valuation: Record<string, unknown> | null = null;
    let fundamentals: Record<string, unknown> | null = null;
    if (facts) {
      const q = normalizeFundamentals(facts, "quarterly", 8).periods;
      const a = normalizeFundamentals(facts, "annual", 1).periods[0];
      const latestQ = q[0];
      const rev = ttm(q, "revenue", "income"),
        ni = ttm(q, "netIncome", "income"),
        fcf = ttm(q, "freeCashFlow", "cashFlow");
      const shares =
        latestQ?.balance.sharesOutstanding ??
        a?.balance.sharesOutstanding ??
        latestQ?.income.sharesDiluted ??
        null;
      const mcap = shares ? price * shares : null;
      const debt = latestQ?.balance.totalDebt ?? null,
        cash = latestQ?.balance.cash ?? null;
      const ev = mcap != null ? mcap + (debt ?? 0) - (cash ?? 0) : null;
      valuation = {
        marketCap: r(mcap, 0),
        sharesOutstanding: shares,
        enterpriseValue: r(ev, 0),
        peTTM: r(div(mcap, ni)),
        psTTM: r(div(mcap, rev)),
        evToSalesTTM: r(div(ev, rev)),
        priceToBook: r(div(mcap, latestQ?.balance.totalEquity)),
        fcfYieldTTM: r(mcap && fcf != null ? fcf / mcap : null, 4),
        basis: `TTM from the last four quarters through ${latestQ?.periodEnd ?? "n/a"} (SEC filings); price ${r(price)}`,
      };
      if (ni != null && ni <= 0) notes.push("TTM net income is negative, so P/E is not meaningful");
      fundamentals = {
        ttm: {
          revenue: rev,
          netIncome: ni,
          freeCashFlow: fcf,
          grossMargin: r(div(ttm(q, "grossProfit", "income"), rev), 4),
          operatingMargin: r(rev ? (ttm(q, "operatingIncome", "income") ?? NaN) / rev : null, 4),
        },
        latestQuarter: latestQ
          ? {
              fiscalYear: latestQ.fiscalYear,
              fiscalPeriod: latestQ.fiscalPeriod,
              periodEnd: latestQ.periodEnd,
              revenue: latestQ.income.revenue,
              revenueYoY: latestQ.growth.revenueYoY,
              netIncome: latestQ.income.netIncome,
              grossMargin: latestQ.ratios.grossMargin,
              filingUrl: latestQ.filingUrl,
            }
          : null,
        balance: latestQ
          ? {
              cash,
              totalDebt: debt,
              netDebt: latestQ.balance.netDebt,
              totalEquity: latestQ.balance.totalEquity,
            }
          : null,
        ...(q.length < 4 ? { note: "fewer than four quarters filed, TTM not available" } : {}),
      };
    }

    // ---- Finnhub extras (all optional) ----
    const [profile, recs, target, earnings, peers] = await Promise.all([
      finnhub<{
        name?: string;
        finnhubIndustry?: string;
        country?: string;
        exchange?: string;
        ipo?: string;
        weburl?: string;
        marketCapitalization?: number;
      }>("/stock/profile2", { symbol: sym }, secrets, 86_400, notes, "Company profile"),
      finnhub<
        {
          period: string;
          strongBuy: number;
          buy: number;
          hold: number;
          sell: number;
          strongSell: number;
        }[]
      >(
        "/stock/recommendation",
        { symbol: sym },
        secrets,
        21_600,
        notes,
        "Analyst recommendations",
      ),
      finnhub<{
        targetHigh?: number;
        targetLow?: number;
        targetMean?: number;
        targetMedian?: number;
        lastUpdated?: string;
      }>("/stock/price-target", { symbol: sym }, secrets, 21_600, notes, "Analyst price targets"),
      finnhub<{
        earningsCalendar?: {
          date: string;
          hour?: string;
          epsEstimate?: number | null;
          revenueEstimate?: number | null;
          quarter?: number;
          year?: number;
        }[];
      }>(
        "/calendar/earnings",
        { symbol: sym, from: iso(Date.now()), to: iso(Date.now() + 120 * DAY) },
        secrets,
        21_600,
        notes,
        "Earnings calendar",
      ),
      finnhub<string[]>("/stock/peers", { symbol: sym }, secrets, 86_400, notes, "Peers"),
    ]);
    const recent = Array.isArray(recs)
      ? recs.slice(0, 3).map((x) => ({
          period: x.period,
          strongBuy: x.strongBuy,
          buy: x.buy,
          hold: x.hold,
          sell: x.sell,
          strongSell: x.strongSell,
        }))
      : null;
    const next = earnings?.earningsCalendar
      ?.filter((e) => e.date >= iso(Date.now()))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const tgt = target?.targetMean
      ? {
          mean: target.targetMean,
          median: target.targetMedian,
          high: target.targetHigh,
          low: target.targetLow,
          upsideToMean: r(target.targetMean / price - 1, 4),
          lastUpdated: target.lastUpdated,
        }
      : null;
    if (target && !target.targetMean && !notes.some((n) => n.startsWith("Analyst price targets")))
      notes.push("Analyst price targets empty (often premium only on Finnhub)");

    const rejected = notes.filter((n) => n.includes("Finnhub key rejected"));
    if (rejected.length > 1) {
      for (const n of rejected) notes.splice(notes.indexOf(n), 1);
      notes.push(
        "Profile, analyst ratings, price targets, earnings date and peers unavailable (Finnhub key rejected)",
      );
    }
    return {
      ticker,
      name: profile?.name || ref?.name || ticker,
      profile: {
        industry: profile?.finnhubIndustry ?? null,
        exchange: profile?.exchange ?? null,
        country: profile?.country ?? null,
        ipo: profile?.ipo ?? null,
        website: profile?.weburl ?? null,
      },
      price: {
        last: r(price),
        prevClose: r(prevClose),
        change: r(prevClose != null ? price - prevClose : null),
        changePct: r(prevClose ? price / prevClose - 1 : null, 4),
        asOf: useQuote ? quote?.timestamp : lastBar.date,
        source: useQuote ? "Tiingo IEX (intraday, IEX only)" : `${prices.source} last close`,
      },
      technicals: tech && {
        returns: tech.returns,
        week52: tech.week52,
        drawdown: tech.drawdown,
        sma: tech.sma,
        rsi14: tech.rsi14,
        macdHistogram: tech.macd.histogram,
        atrPct: tech.atrPct,
        trend: tech.trend,
      },
      valuation,
      fundamentals,
      analysts: recent || tgt ? { recommendations: recent, priceTarget: tgt } : null,
      nextEarnings: next
        ? {
            date: next.date,
            hour: next.hour,
            epsEstimate: next.epsEstimate ?? null,
            revenueEstimate: next.revenueEstimate ?? null,
          }
        : null,
      peers: Array.isArray(peers) ? peers.filter((p) => p !== sym).slice(0, 10) : null,
      notes,
      disclaimer: "Prices are delayed or IEX only. Not investment advice.",
    };
  },
  outputHint:
    "{ ticker, name, profile{industry,exchange,country}, price{last,prevClose,change,changePct,asOf,source}, technicals{returns,week52{high,low,positionInRange,offHigh},drawdown,sma,rsi14,macdHistogram,atrPct,trend[]}, valuation{marketCap,enterpriseValue,peTTM,psTTM,evToSalesTTM,priceToBook,fcfYieldTTM,basis}, fundamentals{ttm,latestQuarter,balance}, analysts?{recommendations[],priceTarget}, nextEarnings?, peers?, notes[] }",
});
