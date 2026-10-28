import { z } from "zod";
import { defineEndpoint, ToolError } from "../../../../src/core/composite.js";
import { normalizeTicker } from "../../../sec-edgar/lib/client.js";
import { fhSym, finnhub } from "../../lib/finnhub.js";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

interface FhNews {
  datetime: number;
  headline: string;
  source: string;
  summary?: string;
  url: string;
  category?: string;
  related?: string;
}

const norm = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const clip = (s: string | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`;
};

/** Dedupe by URL and by normalized headline, newest first, capped. */
export function dedupeNews(items: FhNews[], limit: number) {
  const seenUrl = new Set<string>(),
    seenHead = new Set<string>();
  const out: FhNews[] = [];
  for (const n of [...items].sort((a, b) => b.datetime - a.datetime)) {
    if (!n?.headline || !n.url) continue;
    const h = norm(n.headline).slice(0, 80);
    const u = n.url.replace(/[?&]utm_[^&]*/g, "");
    if (seenUrl.has(u) || seenHead.has(h)) continue;
    seenUrl.add(u);
    seenHead.add(h);
    out.push(n);
    if (out.length >= limit) break;
  }
  return out;
}

export default defineEndpoint({
  id: "stocks#news",
  provider: "stocks",
  meta: {
    displayName: "Stock news: what happened recently",
    summary:
      "Recent company news for a US stock by ticker (headline, source, time, link, short summary), deduplicated, plus the next earnings date and estimates when available. Without a ticker, returns general market news.",
    tags: [
      "equity",
      "stock",
      "news",
      "headlines",
      "company-news",
      "market-news",
      "catalyst",
      "events",
      "earnings-date",
      "why-moving",
      "what-happened",
    ],
  },
  request: { method: "GET", path: "/news" },
  input: z.object({
    ticker: z
      .string()
      .optional()
      .describe("US stock ticker, e.g. SNDK. Omit for general market news."),
    days: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(7)
      .describe("Look back this many days (company news only)"),
    limit: z.number().int().min(1).max(50).default(15),
  }),
  usage: { kind: "PER_CALL", credits: 1 },
  execute: async (input, { secrets }) => {
    const notes: string[] = [];
    const now = Date.now();
    if (!input.ticker) {
      const raw = await finnhub<FhNews[]>(
        "/news",
        { category: "general" },
        secrets,
        900,
        notes,
        "Market news",
      );
      if (!raw)
        throw new ToolError("PROVIDER_ERROR", notes.join("; ") || "Market news unavailable");
      const items = dedupeNews(raw, input.limit);
      return { mode: "market", count: items.length, items: items.map(fmt), notes };
    }
    const ticker = normalizeTicker(input.ticker);
    const sym = fhSym(ticker);
    const from = iso(now - input.days * DAY),
      to = iso(now);
    const [raw, earnings] = await Promise.all([
      finnhub<FhNews[]>(
        "/company-news",
        { symbol: sym, from, to },
        secrets,
        900,
        notes,
        "Company news",
      ),
      finnhub<{
        earningsCalendar?: {
          date: string;
          hour?: string;
          epsEstimate?: number | null;
          revenueEstimate?: number | null;
        }[];
      }>(
        "/calendar/earnings",
        { symbol: sym, from: iso(now), to: iso(now + 120 * DAY) },
        secrets,
        21_600,
        notes,
        "Earnings calendar",
      ),
    ]);
    if (!raw) throw new ToolError("PROVIDER_ERROR", notes.join("; ") || "Company news unavailable");
    const items = dedupeNews(raw, input.limit);
    if (!items.length)
      notes.push(`No company news found for ${ticker} in the last ${input.days} days`);
    const next = earnings?.earningsCalendar
      ?.filter((e) => e.date >= iso(now))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return {
      mode: "company",
      ticker,
      window: { from, to },
      totalFound: raw.length,
      count: items.length,
      items: items.map(fmt),
      upcoming: next
        ? {
            earnings: {
              date: next.date,
              hour: next.hour ?? null,
              epsEstimate: next.epsEstimate ?? null,
              revenueEstimate: next.revenueEstimate ?? null,
            },
          }
        : null,
      notes,
      source: "Finnhub company news (aggregated publishers)",
    };
  },
  outputHint:
    "{ mode, ticker?, window{from,to}, totalFound, count, items[{ time, headline, source, url, summary }], upcoming?{earnings{date,hour,epsEstimate,revenueEstimate}}, notes[] } (newest first)",
});

function fmt(n: FhNews) {
  return {
    time: new Date(n.datetime * 1000).toISOString(),
    headline: n.headline.trim(),
    source: n.source,
    url: n.url,
    summary: clip(n.summary, 280),
  };
}
