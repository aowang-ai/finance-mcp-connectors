import assert from "node:assert/strict";
import test from "node:test";
import { execute } from "../../../../src/core/execute.js";
import { loadFixture, replayFixture } from "../../../../src/core/testing.js";
import incomeStatement from "./endpoint.js";

test("fmp#income-statement maps a statement payload", async () => {
  const fixture = loadFixture(new URL("./fixtures/success.json", import.meta.url));
  const { result, url } = await replayFixture(incomeStatement, fixture);
  assert.equal(url, `${fixture.request.url}&apikey=test-fmp-key`);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.output, {
    symbol: "AAPL",
    period: "annual",
    statements: [
      {
        date: "2024-09-28",
        fiscalYear: "2024",
        period: "FY",
        revenue: 100,
        grossProfit: 40,
        operatingIncome: 30,
        netIncome: 20,
        eps: 1.5,
        epsDiluted: 1.4,
        ebitda: 35,
      },
    ],
  });
});

test("fmp#income-statement returns the recorded invalid-key response", async () => {
  const fixture = loadFixture(new URL("./fixtures/provider-error.json", import.meta.url));
  const { result } = await replayFixture(incomeStatement, fixture);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.status, 401);
});

test("fmp#income-statement does not call the network without FMP_API_KEY", async () => {
  let called = false;
  const result = await execute(
    incomeStatement,
    { symbol: "AAPL" },
    {
      env: {},
      fetch: async () => {
        called = true;
        throw new Error("network");
      },
    },
  );
  assert.equal(called, false);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error.message, /FMP_API_KEY/);
});
