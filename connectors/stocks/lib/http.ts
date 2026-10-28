import { runtimeFetch, ToolError } from "../../../src/core/composite.js";

/** Cached JSON GET with per-host throttle. cacheKey must not contain secrets. */

interface EdgeCache {
  match(r: Request): Promise<Response | undefined>;
  put(r: Request, res: Response): Promise<void>;
}
const edge = () => (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;
const slots = new Map<string, number>();
async function throttle(host: string, gapMs: number) {
  const now = Date.now();
  const at = Math.max(now, slots.get(host) ?? 0);
  slots.set(host, at + gapMs);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

export async function getJson<T>(
  url: string,
  opts: {
    cacheKey: string;
    ttlSec: number;
    gapMs: number;
    headers?: Record<string, string>;
    label: string;
  },
): Promise<T> {
  const cache = edge();
  const key = new Request(
    `https://cache.finance-mcp.internal/${encodeURIComponent(opts.cacheKey)}`,
  );
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return (await hit.json()) as T;
    } catch {
      /* best effort */
    }
  }
  await throttle(new URL(url).host, opts.gapMs);
  let res: Response;
  try {
    res = await runtimeFetch(url, {
      headers: {
        "User-Agent": "finance-mcp.com",
        Accept: "application/json",
        ...(opts.headers ?? {}),
      },
    });
  } catch (e) {
    throw new ToolError(
      "TRANSPORT_ERROR",
      `${opts.label} request failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const text = await res.text();
  if (!res.ok)
    throw new ToolError(
      res.status === 404 ? "NOT_FOUND" : "PROVIDER_ERROR",
      `${opts.label} responded ${res.status}: ${text.slice(0, 160)}`,
      res.status,
    );
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new ToolError("PROVIDER_ERROR", `${opts.label} returned non-JSON: ${text.slice(0, 120)}`);
  }
  if (cache) {
    try {
      await cache.put(
        key,
        new Response(text, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${opts.ttlSec}`,
          },
        }),
      );
    } catch {
      /* ignore */
    }
  }
  return data;
}
