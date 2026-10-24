import assert from "node:assert/strict";
import test from "node:test";
import { discover, findEndpoint, inspect } from "./core/discover.js";
import { endpoints } from "./registry.js";

function top(query: string): string | undefined {
  return discover(endpoints, query, 1)[0]?.id;
}

test("ids are unique and use provider#endpoint", () => {
  const ids = endpoints.map((endpoint) => endpoint.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.sort(), [
    "deribit#options",
    "fmp#income-statement",
    "fred#observations",
    "okx#klines",
    "okx#ticker",
    "polymarket#events",
    "sec-edgar#submissions",
  ]);
});

test("discover ranks the catalog examples", () => {
  assert.equal(top("BTC spot price"), "okx#ticker");
  assert.equal(top("OHLCV candlesticks"), "okx#klines");
  assert.equal(top("BTC option chain"), "deribit#options");
  assert.equal(top("10-K filings"), "sec-edgar#submissions");
  assert.equal(top("AAPL income statement"), "fmp#income-statement");
  assert.equal(top("DGS10 10y yield"), "fred#observations");
  assert.equal(top("Fed prediction markets"), "polymarket#events");
});

test("inspect returns the input schema and output shape", () => {
  const endpoint = findEndpoint(endpoints, "okx#ticker");
  assert.ok(endpoint);
  const doc = inspect(endpoint);
  assert.equal(doc.id, "okx#ticker");
  assert.equal(doc.authEnv, null);
  const schema = doc.inputSchema as { properties?: Record<string, unknown> };
  assert.ok(schema.properties?.instId);
  assert.ok(doc.outputShape);
  const fred = findEndpoint(endpoints, "fred#observations");
  assert.ok(fred);
  assert.equal(inspect(fred).authEnv, "FRED_API_KEY");
});
