import assert from "node:assert/strict";
import test from "node:test";
import { loadFixture, replayFixture } from "../../../../src/core/testing.js";
import events from "./endpoint.js";

test("polymarket#events searches by keyword and sorts open events by volume", async () => {
  const fixture = loadFixture(new URL("./fixtures/recorded.json", import.meta.url));
  const { result, url } = await replayFixture(events, fixture);
  assert.equal(url, fixture.request.url);
  assert.match(url, /\/public-search\?q=SpaceX/);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const output = result.output as {
    query: string;
    events: { title: string; volume: number | null }[];
  };
  assert.equal(output.query, "SpaceX");
  assert.equal(output.events.length, 2);
  for (const e of output.events) assert.match(e.title, /SpaceX/);
  assert.ok((output.events[0]?.volume ?? 0) >= (output.events[1]?.volume ?? 0));
});
