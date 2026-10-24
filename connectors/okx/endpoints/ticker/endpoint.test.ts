import assert from "node:assert/strict";
import test from "node:test";
import { isRecord } from "../../../../src/core/json.js";
import { loadFixture, replayFixture } from "../../../../src/core/testing.js";
import ticker from "./endpoint.js";

test("okx#ticker maps the recorded BTC-USDT ticker", async () => {
  const fixture = loadFixture(new URL("./fixtures/recorded.json", import.meta.url));
  const { result, url, method } = await replayFixture(ticker, fixture);
  assert.equal(method, "GET");
  assert.equal(url, fixture.request.url);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(isRecord(fixture.body));
  const data = fixture.body.data;
  assert.ok(Array.isArray(data) && isRecord(data[0]));
  const row = data[0];
  assert.deepEqual(result.output, {
    instId: row.instId,
    last: row.last,
    bid: row.bidPx,
    ask: row.askPx,
    high24h: row.high24h,
    low24h: row.low24h,
    open24h: row.open24h,
    vol24h: row.vol24h,
    volCcy24h: row.volCcy24h,
    ts: row.ts,
  });
});

test("okx#ticker vendor error is a failed run", async () => {
  const fixture = loadFixture(new URL("./fixtures/provider-error.json", import.meta.url));
  const { result } = await replayFixture(ticker, fixture);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error.message, /51001/);
});
