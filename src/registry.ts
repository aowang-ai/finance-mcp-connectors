import { endpoints as deribit } from "../connectors/deribit/index.js";
import { endpoints as fmp } from "../connectors/fmp/index.js";
import { endpoints as fred } from "../connectors/fred/index.js";
import { endpoints as macro } from "../connectors/macro/index.js";
import { endpoints as okx } from "../connectors/okx/index.js";
import { endpoints as polymarket } from "../connectors/polymarket/index.js";
import { endpoints as secEdgar } from "../connectors/sec-edgar/index.js";
import { endpoints as stocks } from "../connectors/stocks/index.js";
import type { Endpoint } from "./core/types.js";

export const endpoints: Endpoint[] = [
  ...okx,
  ...deribit,
  ...secEdgar,
  ...stocks,
  ...macro,
  ...fmp,
  ...fred,
  ...polymarket,
];

export function endpointById(id: string): Endpoint | undefined {
  return endpoints.find((endpoint) => endpoint.id === id);
}
