import { endpoints as deribit } from "../connectors/deribit/index.js";
import { endpoints as fmp } from "../connectors/fmp/index.js";
import { endpoints as fred } from "../connectors/fred/index.js";
import { endpoints as okx } from "../connectors/okx/index.js";
import { endpoints as polymarket } from "../connectors/polymarket/index.js";
import { endpoints as secEdgar } from "../connectors/sec-edgar/index.js";
import type { Endpoint } from "./core/types.js";

export const endpoints: Endpoint[] = [
  ...secEdgar,
  ...fred,
  ...polymarket,
  ...deribit,
  ...okx,
  ...fmp,
];

export function endpointById(id: string): Endpoint | undefined {
  return endpoints.find((endpoint) => endpoint.id === id);
}
