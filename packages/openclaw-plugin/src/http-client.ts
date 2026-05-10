/**
 * Тонкий HTTP-клієнт для `/api/internal/openclaw/*`. Один екземпляр на
 * plugin instance; інжектиться у tools / hooks через closure.
 *
 * Дизайн-принципи (з плану §604–626):
 *   1. Жодної логіки tools — лише HTTP-плумбінг + bearer auth.
 *   2. Усі помилки ловляться у `OpenClawHttpError` з достатнім контекстом
 *      для audit log-у (tool name, endpoint, status, response preview).
 *   3. Підтримка `fetch` injection — для тестів і для майбутнього
 *      OpenTelemetry instrumentation у Phase 6 (PR-D).
 *   4. Timeout захищає від stuck connections (default 30 с).
 */

export interface HttpClientOptions {
  /** Base URL до server-а (без trailing slash). */
  baseUrl: string;
  /** Bearer token для `Authorization` header. */
  apiKey: string;
  /**
   * Optional `fetch` injection. Default — globalThis.fetch (Node 20+).
   * Тести injectюють mock; Phase 6 (PR-D) injectить fetch з
   * OpenTelemetry tracing wrapper.
   */
  fetchImpl?: typeof globalThis.fetch;
  /** Per-request timeout, ms (default 30 с). */
  timeoutMs?: number;
}

export class OpenClawHttpError extends Error {
  readonly endpoint: string;
  readonly status: number;
  readonly responseText: string;

  constructor(opts: {
    endpoint: string;
    status: number;
    message: string;
    responseText: string;
  }) {
    super(opts.message);
    this.name = "OpenClawHttpError";
    this.endpoint = opts.endpoint;
    this.status = opts.status;
    this.responseText = opts.responseText;
  }
}

export class OpenClawHttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  /**
   * POST JSON to `/api/internal/openclaw/<path>`. Returns parsed JSON
   * response on 2xx. Throws `OpenClawHttpError` otherwise — caller is
   * expected to catch + classify (e.g. 4xx → allowlist_fail, 5xx → error).
   */
  async post<TResp>(path: string, body: unknown): Promise<TResp> {
    const endpoint = this.buildEndpoint(path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        throw new OpenClawHttpError({
          endpoint,
          status: res.status,
          message: `OpenClaw HTTP ${res.status} for ${path}`,
          responseText: text.slice(0, 500),
        });
      }

      if (text.length === 0) {
        return {} as TResp;
      }
      try {
        return JSON.parse(text) as TResp;
      } catch (err) {
        throw new OpenClawHttpError({
          endpoint,
          status: res.status,
          message: `OpenClaw response is not valid JSON: ${
            err instanceof Error ? err.message : String(err)
          }`,
          responseText: text.slice(0, 500),
        });
      }
    } catch (err) {
      if (err instanceof OpenClawHttpError) throw err;
      const status =
        (err as { name?: string })?.name === "AbortError" ? 408 : 0;
      throw new OpenClawHttpError({
        endpoint,
        status,
        message:
          err instanceof Error
            ? `OpenClaw HTTP transport error for ${path}: ${err.message}`
            : `OpenClaw HTTP transport error for ${path}: unknown`,
        responseText: "",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private buildEndpoint(rawPath: string): string {
    const normalized = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    if (normalized.startsWith("/api/internal/openclaw/")) {
      return `${this.baseUrl}${normalized}`;
    }
    return `${this.baseUrl}/api/internal/openclaw${normalized}`;
  }
}
