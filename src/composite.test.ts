import assert from "node:assert/strict";
import test from "node:test";
import { toYoY } from "../connectors/macro/endpoints/overview/endpoint.js";
import { dedupeNews } from "../connectors/stocks/endpoints/news/endpoint.js";
import { discover } from "./core/discover.js";
import { execute } from "./core/execute.js";
import { matchResponse } from "./core/testing.js";
import { endpointById, endpoints } from "./registry.js";

test("composite tools need their key and make no call without it", async () => {
  for (const id of ["stocks#news", "macro#overview"]) {
    const endpoint = endpointById(id);
    assert.ok(endpoint);
    let called = false;
    const result = await execute(endpoint, endpoint.example.params, {
      env: {},
      fetch: async () => {
        called = true;
        throw new Error("network");
      },
    });
    assert.equal(called, false, id);
    assert.equal(result.ok, false, id);
  }
});

test("news is deduplicated by link and headline, newest first", () => {
  const item = { datetime: 2, headline: "Sandisk jumps", source: "a", url: "https://x/1" };
  const out = dedupeNews(
    [
      item,
      { ...item, datetime: 1, url: "https://x/2" },
      { ...item, datetime: 3, headline: "New", url: "https://x/3" },
    ],
    10,
  );
  assert.deepEqual(
    out.map((n) => n.headline),
    ["New", "Sandisk jumps"],
  );
});

test("index levels become YoY percent", () => {
  const pts = Array.from({ length: 13 }, (_, i) => ({
    date: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
    value: i === 12 ? 103 : 100,
  }));
  const yoy = toYoY(pts);
  assert.equal(yoy.length, 1);
  assert.equal(Math.round((yoy[0]?.value ?? 0) * 100) / 100, 3);
});

test("recorded responses match by path and query", () => {
  const responses = [
    {
      url: "https://api.stlouisfed.org/fred/series/observations?series_id=DGS2",
      status: 200,
      body: 2,
    },
    {
      url: "https://api.stlouisfed.org/fred/series/observations?series_id=DGS10",
      status: 200,
      body: 10,
    },
  ];
  const hit = matchResponse(
    responses,
    "https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=x",
  );
  assert.equal(hit?.body, 10);
});

test("discover ranks the composite tools", () => {
  assert.equal(discover(endpoints, "where is this stock now valuation")[0]?.id, "stocks#snapshot");
  assert.equal(discover(endpoints, "company news headlines")[0]?.id, "stocks#news");
  assert.equal(
    discover(endpoints, "us macro overview inflation yield curve")[0]?.id,
    "macro#overview",
  );
});
