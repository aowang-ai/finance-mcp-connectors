import assert from "node:assert/strict";
import test from "node:test";
import { loadFixture, replayFixture } from "./core/testing.js";
import { endpoints } from "./registry.js";

test("every endpoint declares a call, an output shape, and a fixture response", async () => {
  assert.ok(endpoints.length > 0);
  for (const endpoint of endpoints) {
    assert.match(endpoint.meta.docsUrl, /^https:\/\//);
    assert.equal(endpoint.outputShape.type, "object");
    const parsed = endpoint.input.parse(endpoint.example.params) as Record<string, unknown>;
    const request = endpoint.buildRequest(parsed);
    assert.equal(request.method, endpoint.example.request.method);
    assert.equal(request.url, endpoint.example.request.url);

    const fixture = loadFixture(
      new URL(
        `../connectors/${endpoint.provider.name}/endpoints/${endpoint.name}/fixtures/${endpoint.example.fixture}`,
        import.meta.url,
      ),
    );
    assert.deepEqual(fixture.input, endpoint.example.params);
    assert.equal(fixture.request.url, endpoint.example.request.url);
    assert.equal(fixture.status, 200);

    const { result } = await replayFixture(endpoint, fixture);
    assert.equal(result.ok, true, endpoint.id);
    if (!result.ok) continue;
    assert.equal(typeof result.output, "object");
    assert.ok(result.output);
  }
});
