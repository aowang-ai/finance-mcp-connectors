import { normalizeTicker } from "../../sec-edgar/lib/client.js";
import { getJson } from "./http.js";

// Finnhub free tier: 60 calls/minute. Every call is optional: failures become notes.
export async function finnhub<T>(
  path: string,
  params: Record<string, string>,
  secrets: Record<string, string | undefined>,
  ttlSec: number,
  notes: string[],
  what: string,
): Promise<T | null> {
  const key = secrets.FINNHUB_API_KEY;
  if (!key) {
    notes.push(`${what} unavailable (no Finnhub key configured)`);
    return null;
  }
  const qs = new URLSearchParams(params).toString();
  try {
    const d = await getJson<T & { error?: string }>(`https://finnhub.io/api/v1${path}?${qs}`, {
      cacheKey: `fh:${path}:${qs}`,
      ttlSec,
      gapMs: 1_100,
      headers: { "X-Finnhub-Token": key },
      label: "Finnhub",
    });
    if (d && typeof d === "object" && "error" in d && d.error) {
      notes.push(`${what} unavailable (Finnhub: ${d.error})`);
      return null;
    }
    return d;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    notes.push(
      `${what} unavailable (${/401/.test(m) ? "Finnhub key rejected" : /403/.test(m) ? "not on Finnhub free tier" : m.slice(0, 100)})`,
    );
    return null;
  }
}
export const fhSym = (t: string) => normalizeTicker(t).replace("-", ".");
