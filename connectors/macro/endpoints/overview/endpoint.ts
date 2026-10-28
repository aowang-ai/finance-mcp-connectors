import { z } from "zod";
import { defineEndpoint, ToolError } from "../../../../src/core/composite.js";
import { getJson } from "../../../stocks/lib/http.js";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const r = (x: number | null | undefined, dp = 2) =>
  x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** dp) / 10 ** dp;

type Transform = "level" | "yoy";
interface Spec {
  key: string;
  series: string;
  name: string;
  unit: string;
  transform: Transform;
  freq: "daily" | "monthly" | "quarterly";
  flat: number;
}

export const SERIES: Spec[] = [
  {
    key: "fedFunds",
    series: "DFF",
    name: "Effective federal funds rate",
    unit: "%",
    transform: "level",
    freq: "daily",
    flat: 0.1,
  },
  {
    key: "treasury2y",
    series: "DGS2",
    name: "2-year Treasury yield",
    unit: "%",
    transform: "level",
    freq: "daily",
    flat: 0.1,
  },
  {
    key: "treasury10y",
    series: "DGS10",
    name: "10-year Treasury yield",
    unit: "%",
    transform: "level",
    freq: "daily",
    flat: 0.1,
  },
  {
    key: "spread10y2y",
    series: "T10Y2Y",
    name: "10Y minus 2Y Treasury spread",
    unit: "pp",
    transform: "level",
    freq: "daily",
    flat: 0.1,
  },
  {
    key: "cpiYoY",
    series: "CPIAUCSL",
    name: "CPI inflation, year over year",
    unit: "%",
    transform: "yoy",
    freq: "monthly",
    flat: 0.15,
  },
  {
    key: "corePceYoY",
    series: "PCEPILFE",
    name: "Core PCE inflation, year over year",
    unit: "%",
    transform: "yoy",
    freq: "monthly",
    flat: 0.15,
  },
  {
    key: "unemployment",
    series: "UNRATE",
    name: "Unemployment rate",
    unit: "%",
    transform: "level",
    freq: "monthly",
    flat: 0.15,
  },
  {
    key: "realGdpGrowth",
    series: "A191RL1Q225SBEA",
    name: "Real GDP growth, annualized quarter over quarter",
    unit: "%",
    transform: "level",
    freq: "quarterly",
    flat: 0.5,
  },
  {
    key: "vix",
    series: "VIXCLS",
    name: "VIX volatility index",
    unit: "index",
    transform: "level",
    freq: "daily",
    flat: 1.5,
  },
  {
    key: "dollarIndex",
    series: "DTWEXBGS",
    name: "Broad trade-weighted US dollar index",
    unit: "index",
    transform: "level",
    freq: "daily",
    flat: 1,
  },
];
const KEYS = SERIES.map((s) => s.key) as [string, ...string[]];

type Pt = { date: string; value: number };

/** YoY % from an index-level series (matches by month). */
export function toYoY(pts: Pt[]): Pt[] {
  const byMonth = new Map(pts.map((p) => [p.date.slice(0, 7), p.value]));
  const out: Pt[] = [];
  for (const p of pts) {
    const [y, m] = p.date.slice(0, 7).split("-");
    const prev = byMonth.get(`${Number(y) - 1}-${m}`);
    if (prev) out.push({ date: p.date, value: (p.value / prev - 1) * 100 });
  }
  return out;
}

const at = (pts: Pt[], date: string) => {
  let v: Pt | null = null;
  for (const p of pts) {
    if (p.date <= date) v = p;
    else break;
  }
  return v;
};

/** Summarize a series: latest, prior, ~3 months ago, a year ago, trend label. */
export function summarizeSeries(pts: Pt[], flat: number) {
  if (!pts.length) return null;
  const last = pts[pts.length - 1],
    prior = pts[pts.length - 2] ?? null;
  const t = Date.parse(last.date);
  const m3 = at(pts, iso(t - 91 * DAY)),
    y1 = at(pts, iso(t - 365 * DAY));
  const d3 = m3 ? last.value - m3.value : null;
  const trend = d3 == null ? "n/a" : d3 > flat ? "rising" : d3 < -flat ? "falling" : "flat";
  return {
    latest: r(last.value),
    date: last.date,
    prior: prior && {
      value: r(prior.value),
      date: prior.date,
      change: r(last.value - prior.value),
    },
    threeMonthsAgo: m3 && { value: r(m3.value), date: m3.date, change: r(d3) },
    yearAgo: y1 && { value: r(y1.value), date: y1.date, change: r(last.value - y1.value) },
    trend,
  };
}

export default defineEndpoint({
  id: "macro#overview",
  provider: "macro",
  meta: {
    displayName: "US macro overview: rates, inflation, jobs, growth",
    summary:
      "One call for the US macro picture from FRED: fed funds rate, 2Y and 10Y Treasury yields and the 10Y-2Y spread, CPI and core PCE inflation YoY, unemployment, real GDP growth, VIX and the dollar index. Each with latest value, date, change vs prior, 3 months and a year ago, and a trend label.",
    tags: [
      "macro",
      "economy",
      "dashboard",
      "overview",
      "rates",
      "fed",
      "fed-funds",
      "treasury",
      "yield",
      "yield-curve",
      "spread",
      "inversion",
      "inflation",
      "cpi",
      "pce",
      "unemployment",
      "jobs",
      "gdp",
      "growth",
      "vix",
      "volatility",
      "dollar",
      "dxy",
      "recession",
    ],
  },
  request: { method: "GET", path: "/overview" },
  input: z.object({
    series: z
      .array(z.enum(KEYS))
      .optional()
      .describe(`Subset of indicators; default all. Keys: ${KEYS.join(", ")}`),
    history: z
      .number()
      .int()
      .min(0)
      .max(24)
      .default(0)
      .describe("Also return this many recent readings per indicator (oldest first). 0 for none."),
  }),
  usage: { kind: "PER_CALL", credits: 1 },
  execute: async (input, { secrets }) => {
    const key = secrets.FRED_API_KEY;
    if (!key) throw new ToolError("CONFIG_ERROR", "FRED key not configured on the server");
    const specs = input.series?.length
      ? SERIES.filter((s) => input.series?.includes(s.key))
      : SERIES;
    const start = `${iso(Date.now() - 3 * 366 * DAY).slice(0, 7)}-01`;
    const notes: string[] = [];
    const rows = await Promise.all(
      specs.map(async (s) => {
        const qs = `series_id=${s.series}&observation_start=${start}&file_type=json`;
        try {
          const d = await getJson<{ observations?: { date: string; value: string }[] }>(
            `https://api.stlouisfed.org/fred/series/observations?${qs}&api_key=${encodeURIComponent(key)}`,
            {
              cacheKey: `fred:obs:${qs}:${iso(Date.now())}`,
              ttlSec: s.freq === "daily" ? 3_600 : 21_600,
              gapMs: 100,
              label: "FRED",
            },
          );
          let pts: Pt[] = (d.observations ?? [])
            .filter((o) => o.value !== "." && o.value !== "")
            .map((o) => ({ date: o.date, value: Number(o.value) }));
          if (s.transform === "yoy") pts = toYoY(pts);
          const sum = summarizeSeries(pts, s.flat);
          if (!sum) {
            notes.push(`${s.name}: no data`);
            return [s.key, null] as const;
          }
          return [
            s.key,
            {
              name: s.name,
              seriesId: s.series,
              unit: s.unit,
              frequency: s.freq,
              ...(s.transform === "yoy" ? { transform: "YoY % from index level" } : {}),
              ...sum,
              ...(input.history
                ? {
                    history: pts
                      .slice(-input.history)
                      .map((p) => ({ date: p.date, value: r(p.value) })),
                  }
                : {}),
            },
          ] as const;
        } catch (e) {
          notes.push(
            `${s.name} unavailable (${(e instanceof Error ? e.message : String(e)).replace(key, "***").slice(0, 120)})`,
          );
          return [s.key, null] as const;
        }
      }),
    );
    const indicators = Object.fromEntries(rows);
    if (rows.every(([, v]) => v == null))
      throw new ToolError("PROVIDER_ERROR", notes.join("; ") || "FRED unavailable");
    const sp = indicators.spread10y2y as { latest: number } | null;
    const highlights: string[] = [];
    if (sp)
      highlights.push(
        sp.latest < 0
          ? `Yield curve inverted (10Y-2Y ${sp.latest} pp)`
          : `Yield curve positive (10Y-2Y ${sp.latest} pp)`,
      );
    for (const k of ["fedFunds", "cpiYoY", "unemployment"]) {
      const v = indicators[k] as { name: string; latest: number; trend: string } | null;
      if (v) highlights.push(`${v.name} ${v.latest}%, ${v.trend} over 3 months`);
    }
    return {
      asOf: iso(Date.now()),
      indicators,
      highlights,
      notes,
      trendRule:
        "trend compares the latest reading with about 3 months earlier; flat within a small per-series band",
      source: "FRED, Federal Reserve Bank of St. Louis",
    };
  },
  outputHint:
    "{ asOf, indicators{ <key>: { name, seriesId, unit, frequency, latest, date, prior{value,date,change}, threeMonthsAgo{...}, yearAgo{...}, trend, history?[] } }, highlights[], notes[] }",
});
