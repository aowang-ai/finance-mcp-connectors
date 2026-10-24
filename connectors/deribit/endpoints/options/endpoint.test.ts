import assert from "node:assert/strict";
import test from "node:test";
import { isRecord } from "../../../../src/core/json.js";
import { loadFixture, replayFixture } from "../../../../src/core/testing.js";
import options from "./endpoint.js";

test("deribit#options caps and sorts the recorded chain", async () => {
  const fixture = loadFixture(new URL("./fixtures/recorded.json", import.meta.url));
  const { result, url } = await replayFixture(options, fixture);
  assert.equal(url, fixture.request.url);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const output = result.output as {
    currency: string;
    count: number;
    truncated: boolean;
    instruments: { instrumentName: string; expiration: string }[];
  };
  assert.equal(output.currency, "BTC");
  assert.ok(isRecord(fixture.body) && Array.isArray(fixture.body.result));
  assert.equal(output.count, fixture.body.result.length);
  assert.equal(output.truncated, true);
  assert.equal(output.instruments.length, 2);
  const expirations = fixture.body.result.map((row) => {
    assert.ok(isRecord(row));
    return Number(row.expiration_timestamp);
  });
  const soonest = new Date(Math.min(...expirations)).toISOString();
  assert.equal(output.instruments[0]?.expiration, soonest);
});
