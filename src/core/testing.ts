import { readFileSync } from "node:fs";
import { type ExecuteOptions, execute } from "./execute.js";
import type { Endpoint, RunResult } from "./types.js";

export type Fixture = {
  description: string;
  recorded: boolean;
  input: Record<string, unknown>;
  request: { method: "GET"; url: string };
  status: number;
  body: unknown;
  /** Composite tools: every upstream response of the recorded run. */
  responses?: RecordedResponse[];
};

export type RecordedResponse = { url: string; status: number; body: unknown };

const SECRET_PARAMS = new Set(["api_key", "apikey", "token"]);

/** Pick the recorded response for a URL: same host and path, then most matching query params. */
export function matchResponse(
  responses: RecordedResponse[],
  url: string,
): RecordedResponse | undefined {
  const target = new URL(url);
  let best: RecordedResponse | undefined;
  let bestScore = -1;
  for (const candidate of responses) {
    const recorded = new URL(candidate.url);
    if (recorded.host !== target.host || recorded.pathname !== target.pathname) continue;
    let score = 0;
    for (const [key, value] of target.searchParams) {
      if (SECRET_PARAMS.has(key)) continue;
      if (recorded.searchParams.get(key) === value) score += 1;
    }
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function loadFixture(path: string | URL): Fixture {
  return JSON.parse(readFileSync(path, "utf8")) as Fixture;
}

export async function replayFixture(
  endpoint: Endpoint,
  fixture: Fixture,
  options?: Pick<ExecuteOptions, "env">,
): Promise<{ result: RunResult; url: string; method: string; headers: Headers }> {
  let url = "";
  let method = "";
  let headers = new Headers();
  const result = await execute(endpoint, fixture.input, {
    env: {
      FRED_API_KEY: "test-fred-key",
      FMP_API_KEY: "test-fmp-key",
      SEC_EDGAR_USER_AGENT: "finance-mcp-connectors test@example.com",
      FINNHUB_API_KEY: "test-finnhub-key",
      TIINGO_API_KEY: "test-tiingo-key",
      ...options?.env,
    },
    fetch: async (input, init) => {
      url = String(input);
      method = init?.method ?? "GET";
      headers = new Headers(init?.headers);
      const hit = fixture.responses ? matchResponse(fixture.responses, url) : undefined;
      if (fixture.responses && !hit) return new Response("not recorded", { status: 404 });
      const source = hit ?? { status: fixture.status, body: fixture.body };
      const body = typeof source.body === "string" ? source.body : JSON.stringify(source.body);
      return new Response(body, {
        status: source.status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { result, url, method, headers };
}
