import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("server.json points at the hosted MCP server", () => {
  const server = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8")) as {
    name: string;
    description: string;
    remotes?: { type: string; url: string }[];
    packages?: unknown;
  };
  assert.equal(server.name, "io.github.aowang-ai/finance-mcp");
  assert.ok(server.description.length > 0);
  assert.ok(server.description.length <= 100);
  assert.equal(server.packages, undefined);
  assert.deepEqual(server.remotes, [
    { type: "streamable-http", url: "https://finance-mcp.com/mcp" },
  ]);
});
