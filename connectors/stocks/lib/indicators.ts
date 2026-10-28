/** Technical indicators over daily bars (pure functions, oldest first). */

export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

const r = (x: number | null | undefined, dp = 4) =>
  x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** dp) / 10 ** dp;

export function sma(v: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= n) s -= v[i - n];
    out.push(i >= n - 1 ? s / n : null);
  }
  return out;
}

export function ema(v: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (n + 1);
  let prev: number | null = null;
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) prev = v.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n;
    else prev = v[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Wilder RSI. */
export function rsi(v: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  let g = 0,
    l = 0;
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    const up = Math.max(d, 0),
      dn = Math.max(-d, 0);
    if (i <= n) {
      g += up;
      l += dn;
      if (i === n) {
        g /= n;
        l /= n;
        out.push(l === 0 ? 100 : 100 - 100 / (1 + g / l));
      } else out.push(null);
    } else {
      g = (g * (n - 1) + up) / n;
      l = (l * (n - 1) + dn) / n;
      out.push(l === 0 ? 100 : 100 - 100 / (1 + g / l));
    }
  }
  return out;
}

export function macd(v: number[], f = 12, s = 26, sig = 9) {
  const ef = ema(v, f),
    es = ema(v, s);
  const line = v.map((_, i) => (ef[i] != null && es[i] != null ? ef[i]! - es[i]! : null));
  const start = line.findIndex((x) => x !== null);
  const sigLine: (number | null)[] = line.map(() => null);
  if (start >= 0) {
    const e = ema(line.slice(start) as number[], sig);
    for (let i = 0; i < e.length; i++) sigLine[start + i] = e[i];
  }
  return line.map((m, i) => ({
    macd: m,
    signal: sigLine[i],
    histogram: m != null && sigLine[i] != null ? m - sigLine[i]! : null,
  }));
}

export function bollinger(v: number[], n = 20, k = 2) {
  const m = sma(v, n);
  return v.map((_, i) => {
    if (m[i] == null) return { upper: null, middle: null, lower: null };
    const w = v.slice(i - n + 1, i + 1);
    const sd = Math.sqrt(w.reduce((a, x) => a + (x - m[i]!) ** 2, 0) / n);
    return { upper: m[i]! + k * sd, middle: m[i], lower: m[i]! - k * sd };
  });
}

export function atr(b: Bar[], n = 14): (number | null)[] {
  const tr = b.map((x, i) =>
    i === 0
      ? x.high - x.low
      : Math.max(
          x.high - x.low,
          Math.abs(x.high - b[i - 1].close),
          Math.abs(x.low - b[i - 1].close),
        ),
  );
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < tr.length; i++) {
    if (i < n - 1) {
      out.push(null);
      continue;
    }
    prev =
      prev === null ? tr.slice(0, n).reduce((a, c) => a + c, 0) / n : (prev * (n - 1) + tr[i]) / n;
    out.push(prev);
  }
  return out;
}

/** Return over calendar lookback using the last close on or before the target date. */
function closeOnOrBefore(b: Bar[], date: string): number | null {
  for (let i = b.length - 1; i >= 0; i--) if (b[i].date <= date) return b[i].close;
  return null;
}
const minus = (d: string, days: number) =>
  new Date(Date.parse(d) - days * 86_400_000).toISOString().slice(0, 10);

export function summarize(b: Bar[]) {
  if (!b.length) return null;
  const c = b.map((x) => x.close);
  const i = c.length - 1;
  const last = b[i];
  const yr = b.filter((x) => x.date > minus(last.date, 365));
  const hi = Math.max(...yr.map((x) => x.high)),
    lo = Math.min(...yr.map((x) => x.low));
  const hiBar = yr.find((x) => x.high === hi)!,
    loBar = yr.find((x) => x.low === lo)!;
  let peak = -Infinity,
    maxDd = 0;
  for (const x of yr) {
    peak = Math.max(peak, x.close);
    maxDd = Math.min(maxDd, x.close / peak - 1);
  }
  const ret = (days: number) => {
    const p = closeOnOrBefore(b, minus(last.date, days));
    return p ? r(last.close / p - 1) : null;
  };
  const ytdBase = closeOnOrBefore(b, `${Number(last.date.slice(0, 4)) - 1}-12-31`);
  const s20 = sma(c, 20)[i],
    s50 = sma(c, 50)[i],
    s200 = sma(c, 200)[i];
  const m = macd(c)[i],
    bb = bollinger(c)[i],
    a = atr(b)[i],
    rs = rsi(c)[i];
  const trend: string[] = [];
  if (s50 != null && s200 != null)
    trend.push(s50 > s200 ? "50-day above 200-day (uptrend)" : "50-day below 200-day (downtrend)");
  if (s200 != null) trend.push(last.close > s200 ? "price above 200-day" : "price below 200-day");
  if (rs != null)
    trend.push(rs >= 70 ? "RSI overbought" : rs <= 30 ? "RSI oversold" : "RSI neutral");
  if (m.histogram != null) trend.push(m.histogram > 0 ? "MACD above signal" : "MACD below signal");
  return {
    asOf: last.date,
    close: last.close,
    returns: {
      "1w": ret(7),
      "1m": ret(30),
      "3m": ret(91),
      ytd: ytdBase ? r(last.close / ytdBase - 1) : null,
      "1y": ret(365),
    },
    week52: {
      high: r(hi, 2),
      highDate: hiBar.date,
      low: r(lo, 2),
      lowDate: loBar.date,
      positionInRange: r(hi === lo ? null : (last.close - lo) / (hi - lo)),
      offHigh: r(last.close / hi - 1),
    },
    drawdown: {
      fromPeak: r(last.close / Math.max(...yr.map((x) => x.close)) - 1),
      max1y: r(maxDd),
    },
    sma: { "20": r(s20, 2), "50": r(s50, 2), "200": r(s200, 2) },
    ema: { "20": r(ema(c, 20)[i], 2), "50": r(ema(c, 50)[i], 2), "200": r(ema(c, 200)[i], 2) },
    rsi14: r(rs, 2),
    macd: { macd: r(m.macd, 3), signal: r(m.signal, 3), histogram: r(m.histogram, 3) },
    bollinger20: { upper: r(bb.upper, 2), middle: r(bb.middle, 2), lower: r(bb.lower, 2) },
    atr14: r(a, 3),
    atrPct: r(a != null ? a / last.close : null),
    trend,
    ...(b.length < 200
      ? { note: `only ${b.length} trading days of history, longer indicators may be null` }
      : {}),
  };
}

export function toWeekly(b: Bar[]): Bar[] {
  const out: Bar[] = [];
  let cur: Bar | null = null,
    key = "";
  for (const x of b) {
    const d = new Date(`${x.date}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (monday !== key) {
      if (cur) out.push(cur);
      key = monday;
      cur = { ...x };
      continue;
    }
    cur!.high = Math.max(cur!.high, x.high);
    cur!.low = Math.min(cur!.low, x.low);
    cur!.close = x.close;
    cur!.volume = (cur?.volume ?? 0) + (x.volume ?? 0);
    cur!.date = x.date;
  }
  if (cur) out.push(cur);
  return out;
}
