import assert from "node:assert/strict";
import test from "node:test";
import { loadFixture, replayFixture } from "../../../../src/core/testing.js";
import events from "./endpoint.js";

test("polymarket#events maps the recorded Fed event", async () => {
  const fixture = loadFixture(new URL("./fixtures/recorded.json", import.meta.url));
  const { result, url } = await replayFixture(events, fixture);
  assert.equal(url, fixture.request.url);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const output = result.output as {
    tag: string;
    events: { title: string; markets: { outcomes: string[]; outcomePrices: string[] }[] }[];
  };
  assert.equal(output.tag, "Fed");
  assert.equal(output.events.length, 1);
  assert.equal(output.events[0]?.title, "How many Fed rate cuts in 2026?");
  assert.deepEqual(output.events[0]?.markets[0]?.outcomes, ["Yes", "No"]);
  assert.deepEqual(output.events[0]?.markets[0]?.outcomePrices, ["0.9665", "0.0335"]);
});
