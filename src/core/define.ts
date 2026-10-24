import type { z } from "zod";
import type { Endpoint, EndpointExample, EndpointMeta, Provider, RequestParts } from "./types.js";

export function defineProvider(provider: Provider): Provider {
  return provider;
}

export function defineEndpoint<S extends z.ZodType>(def: {
  provider: Provider;
  name: string;
  meta: EndpointMeta;
  input: S;
  outputShape: Record<string, unknown>;
  example: EndpointExample;
  buildRequest: (input: z.infer<S>) => RequestParts;
  parse: (body: unknown, input: z.infer<S>) => unknown;
}): Endpoint {
  return {
    provider: def.provider,
    name: def.name,
    id: `${def.provider.name}#${def.name}`,
    meta: def.meta,
    input: def.input,
    outputShape: def.outputShape,
    example: def.example,
    buildRequest: (input) => def.buildRequest(input as z.infer<S>),
    parse: (body, input) => def.parse(body, input as z.infer<S>),
  };
}

export function endpointUrl(
  base: string,
  params: Record<string, string | number | undefined>,
): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}
