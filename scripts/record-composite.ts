import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { execute } from "../src/core/execute.js";
import type { RecordedResponse } from "../src/core/testing.js";
import { endpointById } from "../src/registry.js";

// Records every upstream response of one composite run. Secrets are stripped from URLs.
// Bodies are pruned: long arrays keep their last items, SEC companyfacts keeps only the
// concepts the mapper reads, and company_tickers keeps the example ticker.

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const id = process.argv[2];
const endpoint = id ? endpointById(id) : undefined;
if (!endpoint?.run) {
  console.error("Usage: npm run record:composite -- <provider#endpoint> [--input '{...}']");
  process.exit(1);
}
const input = JSON.parse(arg("--input") ?? JSON.stringify(endpoint.example.params)) as Record<
  string,
  unknown
>;
const keepArray = Number(arg("--keep") ?? 60);
// Every fixture keeps the same small ticker map so replays in one process agree.
const TICKERS = new Set(["SNDK", "MU", "AAPL", String(input.ticker ?? "").toUpperCase()]);

function clean(url: string): string {
  const parsed = new URL(url);
  for (const key of ["api_key", "apikey", "token"]) parsed.searchParams.delete(key);
  return parsed.toString();
}

function prune(url: string, body: unknown): unknown {
  if (url.includes("company_tickers.json") && body && typeof body === "object") {
    const rows = Object.entries(body as Record<string, { ticker: string }>);
    return Object.fromEntries(rows.filter(([, row]) => TICKERS.has(row.ticker)));
  }
  if (url.includes("companyfacts") && body && typeof body === "object") {
    const facts = (
      body as { facts?: Record<string, Record<string, { units: Record<string, unknown[]> }>> }
    ).facts;
    const used = readFileSync(
      new URL("../connectors/sec-edgar/lib/xbrl.ts", import.meta.url),
      "utf8",
    );
    for (const taxonomy of Object.values(facts ?? {})) {
      for (const [name, concept] of Object.entries(taxonomy)) {
        if (!used.includes(`"${name}"`)) {
          delete taxonomy[name];
          continue;
        }
        for (const unit of Object.keys(concept.units)) {
          concept.units[unit] = (concept.units[unit] ?? []).slice(-40);
        }
      }
    }
    return body;
  }
  return trim(body);
}

function trim(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(-keepArray).map(trim);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trim(item)]));
  }
  return value;
}

const responses: RecordedResponse[] = [];
const result = await execute(endpoint, input, {
  fetch: async (url, init) => {
    const res = await fetch(url, init);
    const text = await res.clone().text();
    let body: unknown = text;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text.length > 20_000 ? text.slice(0, 20_000) : text;
    }
    responses.push({ url: clean(String(url)), status: res.status, body: prune(String(url), body) });
    return res;
  },
});
console.log(result.ok ? "run ok" : `run failed: ${result.error.message}`);

const fixture = {
  description: `Recorded ${new Date().toISOString().slice(0, 10)} from a live composite run, ${responses.length} upstream calls. Pruned; keys removed.`,
  recorded: true,
  input,
  request: endpoint.example.request,
  status: 200,
  body: null,
  responses,
};
const path = `connectors/${endpoint.provider.name}/endpoints/${endpoint.name}/fixtures/recorded.json`;
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${JSON.stringify(fixture, null, 1)}\n`);
console.log(`wrote ${path}`);
