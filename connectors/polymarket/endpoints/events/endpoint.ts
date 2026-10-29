import { z } from "zod";
import { defineEndpoint, endpointUrl } from "../../../../src/core/define.js";
import {
  asArray,
  asRecord,
  optionalNumber,
  optionalString,
  stringList,
} from "../../../../src/core/json.js";
import provider from "../../provider.js";

const input = z.object({
  query: z
    .string()
    .min(1)
    .describe("Keyword matched against event titles and tags, for example SpaceX or Fed."),
  limit: z.number().int().min(1).max(25).default(10).describe("Maximum events. Default 10."),
});

const num = (value: number | null) => value ?? 0;

export default defineEndpoint({
  provider,
  name: "events",
  meta: {
    displayName: "Polymarket events",
    summary:
      "Search prediction markets by keyword; open events only, highest volume first, with implied probabilities, volume, liquidity.",
    description:
      "Open Polymarket events matching a keyword such as SpaceX or Fed, from Gamma public search, sorted by volume. Each market includes outcome labels and implied prices. Prices are the strings Gamma returns, between 0 and 1 when the market is quoted that way.",
    tags: ["prediction", "sentiment", "macro", "politics"],
    docsUrl: "https://docs.polymarket.com/developers/gamma-markets-api/search",
  },
  input,
  outputShape: {
    type: "object",
    required: ["query", "events"],
    properties: {
      query: { type: "string" },
      events: {
        type: "array",
        items: {
          type: "object",
          required: ["title", "slug", "markets"],
          properties: {
            title: { type: "string" },
            slug: { type: "string" },
            endDate: { type: ["string", "null"] },
            volume: { type: ["number", "null"] },
            liquidity: { type: ["number", "null"] },
            markets: {
              type: "array",
              items: {
                type: "object",
                required: ["question", "outcomes", "outcomePrices"],
                properties: {
                  question: { type: "string" },
                  outcomes: { type: "array", items: { type: "string" } },
                  outcomePrices: { type: "array", items: { type: "string" } },
                  volume: { type: ["number", "null"] },
                },
              },
            },
          },
        },
      },
    },
  },
  example: {
    params: { query: "SpaceX", limit: 2 },
    request: {
      method: "GET",
      url: "https://gamma-api.polymarket.com/public-search?q=SpaceX&limit_per_type=50&search_tags=true&search_profiles=false&events_status=active&keep_closed_markets=0",
    },
    fixture: "recorded.json",
  },
  buildRequest: ({ query }) => ({
    method: "GET",
    url: endpointUrl("https://gamma-api.polymarket.com/public-search", {
      q: query,
      limit_per_type: 50,
      search_tags: "true",
      search_profiles: "false",
      events_status: "active",
      keep_closed_markets: 0,
    }),
  }),
  parse: (body, { query, limit }) => {
    const rows = asArray(asRecord(body, "polymarket search").events ?? [], "polymarket events");
    const open = rows.filter((item) => {
      const e = asRecord(item, "polymarket event");
      return e.closed !== true && e.active !== false;
    });
    const events = open.map((item) => {
      const event = asRecord(item, "polymarket event");
      const markets = asArray(event.markets ?? [], "polymarket markets").map((market) => {
        const row = asRecord(market, "polymarket market");
        return {
          question: optionalString(row, "question") ?? "",
          outcomes: stringList(row.outcomes),
          outcomePrices: stringList(row.outcomePrices),
          volume: optionalNumber(row, "volume", "volumeNum"),
        };
      });
      return {
        title: optionalString(event, "title") ?? "",
        slug: optionalString(event, "slug") ?? "",
        endDate: optionalString(event, "endDate"),
        volume: optionalNumber(event, "volume"),
        liquidity: optionalNumber(event, "liquidity"),
        markets,
      };
    });
    events.sort((a, b) => num(b.volume) - num(a.volume));
    return { query, events: events.slice(0, limit) };
  },
});
