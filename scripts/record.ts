import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prepareRequest } from "../src/core/execute.js";
import { endpointById } from "../src/registry.js";

const DROP = new Set([
  "ein",
  "lei",
  "phone",
  "addresses",
  "formerNames",
  "description",
  "image",
  "icon",
  "resolutionSource",
]);

function trim(value: unknown, depth: number): unknown {
  if (typeof value === "string") return value.length > 240 ? `${value.slice(0, 240)}…` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 3).map((item) => trim(item, depth + 1));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (DROP.has(key)) continue;
      out[key] = trim(item, depth + 1);
    }
    return out;
  }
  return null;
}

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const id = process.argv[2];
if (!id || id.startsWith("--")) {
  console.error('Usage: npm run record -- <provider#endpoint> --input \'{"k":"v"}\'');
  process.exit(1);
}

const endpoint = endpointById(id);
if (!endpoint) {
  console.error(`Unknown endpoint ${id}`);
  process.exit(1);
}

const input = JSON.parse(arg("--input") ?? "{}") as unknown;
const prepared = prepareRequest(endpoint, input, process.env);
if (!prepared.ok) {
  console.error(prepared.message);
  process.exit(1);
}

const response = await fetch(prepared.request.url, {
  method: prepared.request.method,
  headers: prepared.request.headers,
  signal: AbortSignal.timeout(20_000),
});
const text = await response.text();
let body: unknown = text;
try {
  body = JSON.parse(text) as unknown;
} catch {
  body = text.slice(0, 500);
}

const url = new URL(prepared.request.url);
url.searchParams.delete("api_key");
url.searchParams.delete("apikey");

const fixture = {
  description: `Recorded ${new Date().toISOString().slice(0, 10)} from ${url.origin}. Trimmed to 3 array items; contact and long text fields dropped.`,
  recorded: true,
  input: prepared.input,
  request: { method: "GET" as const, url: url.toString() },
  status: response.status,
  body: trim(body, 0),
};

const providerDir = endpoint.provider.name;
const path = `connectors/${providerDir}/endpoints/${endpoint.name}/fixtures/recorded.json`;
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${path} HTTP ${response.status}`);
