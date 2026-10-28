# Finance MCP connectors

Connector definitions for [Finance MCP](https://finance-mcp.com): how each source is called, what it accepts, and what it returns.

This repo is the connector layer. Agents use the hosted server. Adding a source is a pull request.

Equity and crypto figures are what those sources return, often delayed. Not investment advice.

## Quickstart

Connect to the hosted server.

- MCP: `https://finance-mcp.com/mcp`
- Skill: `set up https://finance-mcp.com/SKILL.md`
- Docs: [finance-mcp.com/docs](https://finance-mcp.com/docs)

Cursor, in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "finance-mcp": {
      "url": "https://finance-mcp.com/mcp"
    }
  }
}
```

Claude Code:

```
claude mcp add --transport http finance-mcp https://finance-mcp.com/mcp
```

Sign in when the client asks. Other clients are in the docs.

## How an agent uses it

Three verbs. Discover, inspect, and run are free.

1. `finance_discover`: describe the task. `{ "query": "BTC spot price", "limit": 5 }` returns ranked `{ id, provider, displayName, summary }`.
2. `finance_inspect`: read one tool. `{ "id": "okx#ticker" }` returns its input schema and output shape.
3. `finance_run`: call it. `{ "id": "okx#ticker", "params": { "instId": "BTC-USDT" } }`. A failed vendor call returns an error.

Stock tools take the ticker directly. For "where is this stock now", start with `stocks#snapshot`.

```json
{ "id": "stocks#snapshot", "params": { "ticker": "SNDK" } }
{ "id": "stocks#price-history", "params": { "ticker": "MU", "range": "1y", "interval": "daily", "indicators": true } }
{ "id": "stocks#news", "params": { "ticker": "SNDK", "days": 7, "limit": 10 } }
{ "id": "macro#overview", "params": {} }
{ "id": "sec-edgar#fundamentals", "params": { "ticker": "SNDK", "period": "quarterly", "limit": 4 } }
{ "id": "sec-edgar#filings", "params": { "ticker": "MU", "forms": ["10-K", "10-Q", "8-K", "4"], "limit": 10 } }
{ "id": "fmp#income-statement", "params": { "symbol": "AAPL", "period": "annual", "limit": 3 } }
{ "id": "fred#observations", "params": { "seriesId": "DGS10", "limit": 12 } }
{ "id": "sec-edgar#submissions", "params": { "cik": "0000320193" } }
{ "id": "deribit#options", "params": { "currency": "BTC" } }
{ "id": "polymarket#events", "params": { "tag": "Fed" } }
```

## Sources

| Source | Upstream | Auth | Endpoints |
| --- | --- | --- | --- |
| US stocks | Tiingo, Twelve Data, SEC XBRL, [Finnhub](https://finnhub.io/docs/api) | `TIINGO_API_KEY`, `FINNHUB_API_KEY`, optional `TWELVE_DATA_API_KEY` | `stocks#snapshot`, `stocks#price-history`, `stocks#news` |
| US macro | [FRED](https://fred.stlouisfed.org/docs/api/fred/series_observations.html) | `FRED_API_KEY` | `macro#overview` |
| SEC EDGAR | [EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) | `SEC_EDGAR_USER_AGENT`, or the default contact string | `sec-edgar#fundamentals`, `sec-edgar#filings`, `sec-edgar#submissions` |
| FRED | [series observations](https://fred.stlouisfed.org/docs/api/fred/series_observations.html) | `FRED_API_KEY` | `fred#observations` |
| Polymarket | [Gamma events](https://docs.polymarket.com/developers/gamma-markets-api/get-events) | none | `polymarket#events` |
| Deribit | [get_instruments](https://docs.deribit.com/#public-get_instruments) | none | `deribit#options` |
| OKX | [market data](https://www.okx.com/docs-v5/en/#order-book-trading-market-data) | none | `okx#ticker`, `okx#klines` |
| FMP | [income statement](https://site.financialmodelingprep.com/developer/docs) | `FMP_API_KEY` | `fmp#income-statement` |

Stock prices are delayed or IEX only. Finnhub parts of the snapshot are optional and show up as notes when the free tier does not cover them.

## Writing a connector

A connector describes one provider and its endpoints. The id is `<provider>#<endpoint>`.

A provider names the source, links its docs, and says how auth is supplied:

```ts
// connectors/okx/provider.ts
export default defineProvider({
  name: "okx",
  meta: {
    displayName: "OKX",
    summary: "Public crypto spot and swap market data.",
    homepageUrl: "https://www.okx.com",
    docsUrl: "https://www.okx.com/docs-v5/en/#order-book-trading-market-data",
  },
  auth: { kind: "none" },
});
```

An endpoint declares the call, the input schema, the output shape, and an example. The example response is a fixture file, replayed by the test.

```ts
// connectors/okx/endpoints/ticker/endpoint.ts
export default defineEndpoint({
  provider,
  name: "ticker",
  meta: {
    displayName: "OKX ticker",
    summary: "24h ticker (last price, high/low, volume) for a crypto instrument like BTC-USDT.",
    description: "Latest OKX ticker for one spot or swap instrument.",
    tags: ["crypto", "spot", "ticker"],
    docsUrl: "https://www.okx.com/docs-v5/en/#order-book-trading-market-data-get-ticker",
  },
  input: z.object({
    instId: z.string().describe("Instrument id, for example BTC-USDT."),
  }),
  outputShape: {
    type: "object",
    required: ["instId", "last"],
    properties: { instId: { type: "string" }, last: { type: "string" } },
  },
  example: {
    params: { instId: "BTC-USDT" },
    request: {
      method: "GET",
      url: "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT",
    },
    fixture: "recorded.json",
  },
  // buildRequest and parse map that call onto the output shape
});
```

`meta.summary` is what `finance_discover` ranks and `finance_inspect` returns. Say what the endpoint returns.

```
connectors/<name>/
├── provider.ts
└── endpoints/<endpoint>/
    ├── endpoint.ts
    ├── endpoint.test.ts
    └── fixtures/*.json
```

Composite tools, the ones that combine several upstream calls (`stocks#*`, `macro#overview`, `sec-edgar#fundamentals`, `sec-edgar#filings`), declare an `execute` function and are wrapped with `composite()` in the connector's `index.ts`. Their fixture records every upstream response of one run; `npm run record:composite -- <provider>#<endpoint>` writes it with keys removed.

1. Read [`connectors/okx`](connectors/okx) and [`connectors/fred`](connectors/fred), and [CONTRIBUTING.md](CONTRIBUTING.md).
2. Write the provider and the endpoint.
3. Record a fixture with `npm run record`, then keep it trimmed.
4. `npm test` and `npm run lint` must pass with no network.
5. Open a pull request.

Check the definitions locally:

```bash
npm install
npm test
npm run catalog
```

## Repo layout

```
connectors/     provider + endpoint definitions
src/            catalog load and fixture replay
scripts/        catalog and record
server.json     registry entry for the hosted server
```

## License

MIT. See [LICENSE](LICENSE).
