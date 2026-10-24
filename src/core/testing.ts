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
};

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
      ...options?.env,
    },
    fetch: async (input, init) => {
      url = String(input);
      method = init?.method ?? "GET";
      headers = new Headers(init?.headers);
      const body = typeof fixture.body === "string" ? fixture.body : JSON.stringify(fixture.body);
      return new Response(body, {
        status: fixture.status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { result, url, method, headers };
}
