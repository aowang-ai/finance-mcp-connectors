import { runtimeFetch, ToolError } from "../../../src/core/composite.js";
import { DEFAULT_SEC_USER_AGENT } from "../provider.js";

/**
 * SEC fair-access client: descriptive User-Agent, per-isolate throttle
 * (well under SEC's 10 requests/second), and two cache layers
 * (in-isolate memory, then the Workers Cache API when available).
 */

// Set SEC_EDGAR_USER_AGENT to your own contact string.
export const DEFAULT_SEC_UA = DEFAULT_SEC_USER_AGENT;

export function secUserAgent(secrets: Record<string, string | undefined>): string {
  const v = (secrets.SEC_EDGAR_USER_AGENT ?? secrets.SEC_USER_AGENT)?.trim();
  return v && !v.includes("example.com") ? v : DEFAULT_SEC_UA;
}

// ---- throttle: at most ~6 requests/second per isolate -------------------
const MIN_GAP_MS = 160;
let nextSlot = 0;
async function throttle(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

// ---- memory cache (small, parsed values) ---------------------------------
const MEM_MAX = 8;
const mem = new Map<string, { exp: number; value: unknown }>();
function memGet<T>(key: string): T | undefined {
  const hit = mem.get(key);
  if (!hit) return undefined;
  if (hit.exp < Date.now()) {
    mem.delete(key);
    return undefined;
  }
  mem.delete(key);
  mem.set(key, hit); // LRU touch
  return hit.value as T;
}
function memSet(key: string, value: unknown, ttlSec: number) {
  mem.set(key, { exp: Date.now() + ttlSec * 1000, value });
  while (mem.size > MEM_MAX) mem.delete(mem.keys().next().value as string);
}

interface EdgeCache {
  match(r: Request): Promise<Response | undefined>;
  put(r: Request, res: Response): Promise<void>;
}
function edgeCache(): EdgeCache | undefined {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return c?.default;
}

/** Test hook. */
export function _resetSecCache() {
  mem.clear();
  nextSlot = 0;
}

export interface SecFetchOpts {
  ttlSec: number;
  secrets: Record<string, string | undefined>;
  as?: "json" | "text";
  /** keep parsed result in isolate memory (only for small or hot payloads) */
  memo?: boolean;
}

export async function secFetch<T = unknown>(url: string, opts: SecFetchOpts): Promise<T> {
  const as = opts.as ?? "json";
  const key = `${as}:${url}`;
  if (opts.memo !== false) {
    const m = memGet<T>(key);
    if (m !== undefined) return m;
  }
  const cache = edgeCache();
  const cacheKey = new Request(url, { method: "GET" });
  let text: string | undefined;
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) text = await hit.text();
    } catch {
      /* cache is best effort */
    }
  }
  if (text === undefined) {
    await throttle();
    let res: Response;
    try {
      res = await runtimeFetch(url, {
        headers: {
          "User-Agent": secUserAgent(opts.secrets),
          Accept: as === "json" ? "application/json" : "application/xml,text/xml,*/*",
          "Accept-Encoding": "gzip, deflate",
        },
      });
    } catch (e) {
      throw new ToolError(
        "TRANSPORT_ERROR",
        `SEC request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (res.status === 404) throw new ToolError("NOT_FOUND", `SEC has no data at ${url}`, 404);
    if (!res.ok)
      throw new ToolError("PROVIDER_ERROR", `SEC responded ${res.status} for ${url}`, res.status);
    text = await res.text();
    if (cache) {
      try {
        await cache.put(
          cacheKey,
          new Response(text, {
            headers: {
              "Content-Type": as === "json" ? "application/json" : "text/plain",
              "Cache-Control": `public, max-age=${opts.ttlSec}`,
            },
          }),
        );
      } catch {
        /* ignore */
      }
    }
  }
  let value: unknown = text;
  if (as === "json") {
    try {
      value = JSON.parse(text);
    } catch {
      throw new ToolError("PROVIDER_ERROR", `SEC returned non-JSON for ${url}`);
    }
  }
  if (opts.memo !== false) memSet(key, value, opts.ttlSec);
  return value as T;
}

// ---- ticker -> CIK -------------------------------------------------------
export interface CompanyRef {
  cik: string;
  cikInt: number;
  ticker: string;
  name: string;
}

export function normalizeTicker(t: string): string {
  return t.trim().toUpperCase().replace(/\./g, "-").replace(/\s+/g, "");
}

let tickerIndex: { exp: number; map: Map<string, CompanyRef> } | undefined;

export async function resolveTicker(
  ticker: string,
  secrets: Record<string, string | undefined>,
): Promise<CompanyRef> {
  const t = normalizeTicker(ticker);
  if (/^\d{1,10}$/.test(t)) {
    const n = Number(t);
    return { cik: String(n).padStart(10, "0"), cikInt: n, ticker: t, name: "" };
  }
  if (!tickerIndex || tickerIndex.exp < Date.now()) {
    const raw = await secFetch<Record<string, { cik_str: number; ticker: string; title: string }>>(
      "https://www.sec.gov/files/company_tickers.json",
      { ttlSec: 86_400, secrets, memo: false },
    );
    const map = new Map<string, CompanyRef>();
    for (const row of Object.values(raw)) {
      const key = normalizeTicker(row.ticker);
      if (map.has(key)) continue;
      map.set(key, {
        cik: String(row.cik_str).padStart(10, "0"),
        cikInt: row.cik_str,
        ticker: row.ticker,
        name: row.title,
      });
    }
    tickerIndex = { exp: Date.now() + 86_400_000, map };
  }
  const ref = tickerIndex.map.get(t);
  if (!ref)
    throw new ToolError(
      "BAD_INPUT",
      `Unknown US ticker "${ticker}". Pass the exchange ticker of an SEC-registered company (e.g. AAPL, SNDK) or a CIK.`,
    );
  return ref;
}

export function _resetTickerIndex() {
  tickerIndex = undefined;
}

export function filingUrls(cikInt: number, accession: string, primaryDocument?: string) {
  const nodash = accession.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${nodash}`;
  return {
    indexUrl: `${base}/${accession}-index.htm`,
    documentUrl: primaryDocument ? `${base}/${primaryDocument}` : undefined,
  };
}
