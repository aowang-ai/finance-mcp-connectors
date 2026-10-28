# Contributing

Add one source as a connector. A connector is a provider plus its endpoints. Agents call the hosted server at [finance-mcp.com](https://finance-mcp.com); this repo is the definition of those sources.

The reference shapes are [connectors/okx](connectors/okx) (no key, two endpoints) and [connectors/fred](connectors/fred) (API key in the query string).

## Add a source

1. Create `connectors/<name>/provider.ts` with `defineProvider`: `name`, `meta` (display name, summary, homepage, docs), and `auth`.
2. Add `connectors/<name>/endpoints/<endpoint>/endpoint.ts` with `defineEndpoint`. The id is `<provider>#<endpoint>`.
3. Declare `input`, `outputShape`, `example`, `buildRequest`, and `parse`. `example.fixture` names the response file under `fixtures/`. `example.request` is the upstream call, before auth is applied.
4. Write `meta.summary` as what the endpoint returns. Discover ranks that text, the description, and the tags.
5. Map a small, stable object in `parse`. Do not pass the raw vendor payload through.
6. Record a fixture and replay it. Tests must pass with no network.

```
npm run record -- <provider>#<endpoint> --input '{"field":"value"}'
```

Trim anything the mapper does not need, and drop contact fields, before committing. Keyed sources read `FRED_API_KEY` or `FMP_API_KEY` from the environment at record time. If you cannot record a success body, commit the recorded error response and a clearly marked sample payload, then replace the sample when a key is available.

7. Export the endpoint from `connectors/<name>/index.ts`.
8. Add it to `src/registry.ts`.
9. Run `npm test` and `npm run lint`.
10. Open a pull request.

A tool that needs several upstream calls is a composite: write `execute(input, { secrets })` with `defineEndpoint` from `src/core/composite.ts`, wrap it with `composite()` in `index.ts`, and record its fixture with `npm run record:composite -- <provider>#<endpoint>`. Use `runtimeFetch` for network calls so replays stay offline. See [connectors/macro](connectors/macro).

Auth is one of `none`, `query` (`env` + `param`), or `header` (`env` + `header`, optional `defaultValue`). The key stays in the environment. Do not commit keys or recorded payloads that still contain them.

`npm test` replays fixtures and checks that each example call matches its fixture. CI runs that plus lint. A connector that needs a live key to pass tests is not ready.
