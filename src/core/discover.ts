import { z } from "zod";
import type { Endpoint } from "./types.js";

export type CatalogHit = {
  id: string;
  provider: string;
  displayName: string;
  summary: string;
};

function queryTokens(query: string): string[] {
  const lower = query.toLowerCase();
  const parts = lower.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
  const extras: string[] = [];
  if (/10[-\s]?k/.test(lower)) extras.push("10-k", "filings");
  if (/10[-\s]?q/.test(lower)) extras.push("10-q", "filings");
  if (/8[-\s]?k/.test(lower)) extras.push("8-k", "filings");
  if (/(ohlcv|candlestick|kline)/.test(lower)) extras.push("ohlcv", "klines");
  return [...parts, ...extras];
}

function scoreEndpoint(endpoint: Endpoint, tokens: string[]): number {
  const tags = endpoint.meta.tags.map((tag) => tag.toLowerCase());
  const name = `${endpoint.meta.displayName} ${endpoint.name} ${endpoint.id}`.toLowerCase();
  const summary = `${endpoint.meta.summary} ${endpoint.meta.description}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (tags.includes(token)) score += 5;
    else if (tags.some((tag) => tag.includes(token))) score += 3;
    if (name.includes(token)) score += 3;
    if (summary.includes(token)) score += 2;
  }
  return score;
}

export function discover(endpoints: Endpoint[], query: string, limit = 5): CatalogHit[] {
  const tokens = queryTokens(query);
  return endpoints
    .map((endpoint) => ({ endpoint, score: scoreEndpoint(endpoint, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.endpoint.id.localeCompare(b.endpoint.id))
    .slice(0, limit)
    .map(({ endpoint }) => ({
      id: endpoint.id,
      provider: endpoint.provider.name,
      displayName: endpoint.meta.displayName,
      summary: endpoint.meta.summary,
    }));
}

export function inspect(endpoint: Endpoint): Record<string, unknown> {
  return {
    id: endpoint.id,
    provider: endpoint.provider.name,
    displayName: endpoint.meta.displayName,
    summary: endpoint.meta.summary,
    description: endpoint.meta.description,
    tags: endpoint.meta.tags,
    docsUrl: endpoint.meta.docsUrl,
    authEnv: authEnv(endpoint),
    ...(endpoint.envs ? { envs: endpoint.envs } : {}),
    inputSchema: z.toJSONSchema(endpoint.input),
    outputShape: endpoint.outputShape,
  };
}

function authEnv(endpoint: Endpoint): string | null {
  if (endpoint.envs) return endpoint.envs.required[0] ?? null;
  const auth = endpoint.provider.auth;
  if (auth.kind === "none") return null;
  if (auth.kind === "header" && auth.defaultValue) return null;
  return auth.env;
}

export function findEndpoint(endpoints: Endpoint[], id: string): Endpoint | undefined {
  return endpoints.find((endpoint) => endpoint.id === id);
}
