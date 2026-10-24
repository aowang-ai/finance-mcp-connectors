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
  tag: z.string().min(1).describe("Tag or topic, for example Fed."),
  limit: z.number().int().min(1).max(25).default(10).describe("Maximum events. Default 10."),
});

function tagSlug(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

export default defineEndpoint({
  provider,
  name: "events",
  meta: {
    displayName: "Polymarket events",
    summary:
      "Search prediction markets by keyword; returns implied probabilities, volume, liquidity.",
    description:
      "Active Polymarket events for a tag such as Fed. Each market includes outcome labels and implied prices. Prices are the strings Gamma returns, between 0 and 1 when the market is quoted that way.",
    tags: ["prediction", "sentiment", "macro", "politics"],
    docsUrl: "https://docs.polymarket.com/developers/gamma-markets-api/get-events",
  },
  input,
  outputShape: {
    type: "object",
    required: ["tag", "events"],
    properties: {
      tag: { type: "string" },
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
    params: { tag: "Fed", limit: 1 },
    request: {
      method: "GET",
      url: "https://gamma-api.polymarket.com/events?limit=1&active=true&closed=false&tag_slug=fed",
    },
    fixture: "recorded.json",
  },
  buildRequest: ({ tag, limit }) => ({
    method: "GET",
    url: endpointUrl("https://gamma-api.polymarket.com/events", {
      limit,
      active: "true",
      closed: "false",
      tag_slug: tagSlug(tag),
    }),
  }),
  parse: (body, { tag }) => {
    const events = asArray(body, "polymarket events").map((item) => {
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
    return { tag, events };
  },
});
