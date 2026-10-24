import assert from "node:assert/strict";
import test from "node:test";
import { execute } from "../../../../src/core/execute.js";
import { loadFixture, replayFixture } from "../../../../src/core/testing.js";
import observations from "./endpoint.js";

test("fred#observations maps a series payload and nulls missing prints", async () => {
  const fixture = loadFixture(new URL("./fixtures/success.json", import.meta.url));
  const { result, url } = await replayFixture(observations, fixture);
  assert.equal(url, `${fixture.request.url}&api_key=test-fred-key`);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.output, {
    seriesId: "DGS10",
    count: 2,
    observations: [
      { date: "2026-10-21", value: "4.01" },
      { date: "2026-10-20", value: null },
    ],
  });
});

test("fred#observations returns the recorded missing-key response", async () => {
  const fixture = loadFixture(new URL("./fixtures/provider-error.json", import.meta.url));
  const { result } = await replayFixture(observations, fixture);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.status, 400);
  assert.match(result.error.message, /api_key/);
});

test("fred#observations does not call the network without FRED_API_KEY", async () => {
  let called = false;
  const result = await execute(
    observations,
    { seriesId: "DGS10" },
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
  assert.match(result.error.message, /FRED_API_KEY/);
});

test("fred#observations redacts api_key in transport errors", async () => {
  const result = await execute(
    observations,
    { seriesId: "DGS10", limit: 1 },
    {
      env: { FRED_API_KEY: "supersecret" },
      fetch: async (url) => {
        throw new Error(`connect failed ${String(url)}`);
      },
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.message.includes("supersecret"), false);
  assert.match(result.error.message, /api_key=\*\*\*/);
});
