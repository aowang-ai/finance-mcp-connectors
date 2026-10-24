import assert from "node:assert/strict";
import test from "node:test";
import { isRecord } from "../../../../src/core/json.js";
import { loadFixture, replayFixture } from "../../../../src/core/testing.js";
import klines from "./endpoint.js";

test("okx#klines maps recorded candlesticks", async () => {
  const fixture = loadFixture(new URL("./fixtures/recorded.json", import.meta.url));
  const { result, url } = await replayFixture(klines, fixture);
  assert.equal(url, fixture.request.url);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(isRecord(fixture.body) && Array.isArray(fixture.body.data));
  const output = result.output as { bar: string; candles: { ts: string; confirmed: boolean }[] };
  assert.equal(output.bar, "1H");
  assert.equal(output.candles.length, fixture.body.data.length);
  const first = fixture.body.data[0] as unknown[];
  assert.equal(output.candles[0]?.ts, String(first[0]));
  assert.equal(output.candles[0]?.confirmed, String(first[8]) === "1");
});
