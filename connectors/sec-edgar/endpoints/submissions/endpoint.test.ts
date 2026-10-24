import assert from "node:assert/strict";
import test from "node:test";
import { execute } from "../../../../src/core/execute.js";
import { isRecord } from "../../../../src/core/json.js";
import { loadFixture, replayFixture } from "../../../../src/core/testing.js";
import { DEFAULT_SEC_USER_AGENT } from "../../provider.js";
import submissions, { normalizeCik } from "./endpoint.js";

test("sec-edgar#submissions maps the recorded Apple index", async () => {
  const fixture = loadFixture(new URL("./fixtures/recorded.json", import.meta.url));
  const { result, url, headers } = await replayFixture(submissions, fixture);
  assert.equal(url, fixture.request.url);
  assert.equal(headers.get("user-agent"), "finance-mcp-connectors test@example.com");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const output = result.output as { name: string; tickers: string[]; filings: { form: string }[] };
  assert.equal(output.name, "Apple Inc.");
  assert.deepEqual(output.tickers, ["AAPL"]);
  assert.equal(output.filings.length, 2);
  assert.ok(isRecord(fixture.body));
  const filings = fixture.body.filings;
  assert.ok(isRecord(filings) && isRecord(filings.recent) && Array.isArray(filings.recent.form));
  assert.equal(output.filings[0]?.form, filings.recent.form[0]);
});

test("sec cik padding and default user agent", async () => {
  assert.equal(normalizeCik("320193"), "0000320193");
  let userAgent = "";
  const result = await execute(
    submissions,
    { cik: "320193", limit: 1 },
    {
      env: {},
      fetch: async (_url, init) => {
        userAgent = new Headers(init?.headers).get("user-agent") ?? "";
        return new Response(
          JSON.stringify({ name: "Example", filings: { recent: { form: ["10-K"] } } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    },
  );
  assert.equal(userAgent, DEFAULT_SEC_USER_AGENT);
  assert.equal(result.ok, true);
});
