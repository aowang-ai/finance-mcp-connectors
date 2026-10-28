import { AsyncLocalStorage } from "node:async_hooks";
import type { z } from "zod";
import type { Endpoint, EndpointExample, Env, Provider } from "./types.js";

/** Error with a stable code, raised by composite tools. */
export class ToolError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const fetchScope = new AsyncLocalStorage<typeof fetch>();

/** fetch for composite connectors; tests and execute() can inject one per run. */
export function runtimeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const impl = fetchScope.getStore() ?? fetch;
  return impl(input, init);
}

export function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  return fetchScope.run(impl, fn);
}

/** Shape the composite files declare, close to the hosted server's definitions. */
export type CompositeDef<S extends z.ZodType> = {
  id: string;
  provider: string;
  meta: { displayName: string; summary: string; tags?: string[] };
  request: { method: "GET"; path: string };
  input: S;
  usage: { kind: "PER_CALL"; credits: number };
  execute: (input: z.infer<S>, ctx: { secrets: Env }) => Promise<unknown>;
  outputHint?: string;
};

export function defineEndpoint<S extends z.ZodType>(def: CompositeDef<S>): CompositeDef<S> {
  return def;
}

/** Turn a composite definition into a catalog Endpoint. */
export function composite<S extends z.ZodType>(
  provider: Provider,
  def: CompositeDef<S>,
  extra: {
    description: string;
    docsUrl: string;
    outputShape: Record<string, unknown>;
    example: EndpointExample;
    envs: { required: string[]; optional: string[] };
  },
): Endpoint {
  const name = def.id.split("#")[1] ?? def.id;
  return {
    provider,
    name,
    id: def.id,
    meta: {
      displayName: def.meta.displayName,
      summary: def.meta.summary,
      description: extra.description,
      tags: def.meta.tags ?? [],
      docsUrl: extra.docsUrl,
    },
    input: def.input,
    outputShape: { ...extra.outputShape, description: def.outputHint },
    example: extra.example,
    buildRequest: () => extra.example.request,
    parse: (body) => body,
    run: (input, ctx) => def.execute(input as z.infer<S>, { secrets: ctx.env }),
    envs: extra.envs,
  };
}
