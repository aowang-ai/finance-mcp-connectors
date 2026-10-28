import { withFetch } from "./composite.js";
import type { Endpoint, Env, RequestParts, RunResult } from "./types.js";

const DEFAULT_USER_AGENT = "finance-mcp-connectors/0.1";

export type ExecuteOptions = {
  fetch?: typeof fetch;
  env?: Env;
  timeoutMs?: number;
};

export function redactSecrets(value: string): string {
  return value.replace(/([?&](?:api_key|apikey|token)=)[^&\s]+/gi, "$1***");
}

function envOf(options: ExecuteOptions | undefined): Env {
  return options?.env ?? process.env;
}

export function prepareRequest(
  endpoint: Endpoint,
  params: unknown,
  env: Env,
):
  | { ok: true; input: Record<string, unknown>; request: RequestParts }
  | { ok: false; message: string } {
  const parsed = endpoint.input.safeParse(params ?? {});
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const input = parsed.data as Record<string, unknown>;
  try {
    return { ok: true, input, request: applyAuth(endpoint, endpoint.buildRequest(input), env) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Request failed" };
  }
}

function applyAuth(endpoint: Endpoint, request: RequestParts, env: Env): RequestParts {
  const headers = {
    Accept: "application/json",
    "User-Agent": DEFAULT_USER_AGENT,
    ...request.headers,
  };
  const auth = endpoint.provider.auth;
  if (auth.kind === "none") return { ...request, headers };
  if (auth.kind === "header") {
    const value = env[auth.env] ?? auth.defaultValue;
    if (!value) {
      throw new Error(`${auth.env} is not set`);
    }
    return { ...request, headers: { ...headers, [auth.header]: value } };
  }
  const value = env[auth.env];
  if (!value) throw new Error(`${auth.env} is not set`);
  const url = new URL(request.url);
  url.searchParams.set(auth.param, value);
  return { ...request, url: url.toString(), headers };
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 500);
  }
}

export async function execute(
  endpoint: Endpoint,
  params: unknown,
  options?: ExecuteOptions,
): Promise<RunResult> {
  if (endpoint.run) return runComposite(endpoint, params, options);
  const prepared = prepareRequest(endpoint, params, envOf(options));
  if (!prepared.ok) {
    return { ok: false, id: endpoint.id, error: { message: prepared.message } };
  }
  const { input, request } = prepared;

  const fetchImpl = options?.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      signal: AbortSignal.timeout(options?.timeoutMs ?? 20_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    return { ok: false, id: endpoint.id, error: { message: redactSecrets(message) } };
  }

  const body = await readBody(response);
  if (!response.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body).slice(0, 500);
    return {
      ok: false,
      id: endpoint.id,
      error: {
        status: response.status,
        message: redactSecrets(`${endpoint.id} returned HTTP ${response.status}: ${detail}`),
      },
    };
  }

  try {
    return { ok: true, id: endpoint.id, output: endpoint.parse(body, input) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Response did not match the connector";
    return { ok: false, id: endpoint.id, error: { message: redactSecrets(message) } };
  }
}

async function runComposite(
  endpoint: Endpoint,
  params: unknown,
  options?: ExecuteOptions,
): Promise<RunResult> {
  const parsed = endpoint.input.safeParse(params ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return { ok: false, id: endpoint.id, error: { message } };
  }
  const env = envOf(options);
  const missing = (endpoint.envs?.required ?? []).filter((name) => !env[name]);
  if (missing.length > 0) {
    return { ok: false, id: endpoint.id, error: { message: `${missing.join(", ")} is not set` } };
  }
  const run = endpoint.run;
  if (!run) return { ok: false, id: endpoint.id, error: { message: "not a composite" } };
  try {
    const output = await withFetch(options?.fetch ?? fetch, () =>
      run(parsed.data as Record<string, unknown>, { env }),
    );
    return { ok: true, id: endpoint.id, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Composite run failed";
    const status = (error as { status?: number }).status;
    return {
      ok: false,
      id: endpoint.id,
      error: { message: redactSecrets(message), ...(status ? { status } : {}) },
    };
  }
}
