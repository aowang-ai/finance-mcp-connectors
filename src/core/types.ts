import type { z } from "zod";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type EndpointMeta = {
  displayName: string;
  summary: string;
  description: string;
  tags: string[];
  docsUrl: string;
};

export type ProviderMeta = {
  displayName: string;
  summary: string;
  homepageUrl: string;
  docsUrl: string;
};

export type Auth =
  | { kind: "none" }
  | { kind: "query"; env: string; param: string }
  | { kind: "header"; env: string; header: string; defaultValue?: string };

export type Provider = {
  name: string;
  meta: ProviderMeta;
  auth: Auth;
};

export type RequestParts = {
  method: "GET";
  url: string;
  headers?: Record<string, string>;
};

export type EndpointExample = {
  params: Record<string, unknown>;
  request: RequestParts;
  /** Fixture file under endpoints/<endpoint>/fixtures/. Its body is the example response. */
  fixture: string;
};

export type Endpoint = {
  provider: Provider;
  name: string;
  id: string;
  meta: EndpointMeta;
  input: z.ZodType;
  outputShape: Record<string, unknown>;
  example: EndpointExample;
  buildRequest: (input: Record<string, unknown>) => RequestParts;
  parse: (body: unknown, input: Record<string, unknown>) => unknown;
};

export type Env = Record<string, string | undefined>;

export type RunSuccess = {
  ok: true;
  id: string;
  output: unknown;
};

export type RunFailure = {
  ok: false;
  id: string;
  error: {
    message: string;
    status?: number;
  };
};

export type RunResult = RunSuccess | RunFailure;
