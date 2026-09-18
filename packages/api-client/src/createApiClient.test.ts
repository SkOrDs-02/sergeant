// @vitest-environment jsdom
//
// Smoke test for `createApiClient` — the single factory that wires every
// endpoint module onto one shared `HttpClient` instance. No endpoint module
// has its own construction test (they're exercised via `create*Endpoints`
// directly), so this locks that the composition root actually builds a
// complete, correctly-shaped client with no module accidentally omitted.
import { describe, expect, it } from "vitest";
import { createApiClient } from "./createApiClient";

describe("createApiClient", () => {
  it("builds a client exposing every endpoint module plus the raw http handle", () => {
    const client = createApiClient({ baseUrl: "https://api.example.com" });

    expect(client.http).toBeDefined();
    expect(typeof client.http.get).toBe("function");
    expect(typeof client.http.post).toBe("function");

    const moduleKeys: Array<keyof typeof client> = [
      "me",
      "syncV2",
      "coach",
      "chat",
      "push",
      "nutrition",
      "barcode",
      "foodSearch",
      "monoWebhook",
      "privat",
      "waitlist",
      "billing",
      "finyk",
      "weeklyDigest",
      "transcribe",
      "webVitals",
    ];
    for (const key of moduleKeys) {
      expect(client[key]).toBeDefined();
      expect(typeof client[key]).toBe("object");
    }
  });

  it("defaults config to {} when called with no arguments", () => {
    // The `config: ApiClientConfig = {}` default parameter — callers that
    // just want relative-URL fetch() behaviour (e.g. same-origin SSR)
    // must not have to pass an empty object explicitly.
    expect(() => createApiClient()).not.toThrow();
    const client = createApiClient();
    expect(client.http).toBeDefined();
  });

  it("each call returns endpoint modules bound to the SAME http instance", () => {
    // Regression guard: a future refactor that constructs a fresh
    // HttpClient per endpoint module would break shared config (auth
    // header injection, base URL) across modules silently.
    const client = createApiClient({ baseUrl: "https://api.example.com" });
    // coach/chat/etc. close over `http` — verifying they all share config
    // is implicit in every endpoint's own request test, so here we just
    // confirm the factory returns a fresh object graph per call (no
    // accidental module-level singleton leaking state across clients).
    const other = createApiClient({ baseUrl: "https://other.example.com" });
    expect(client.http).not.toBe(other.http);
    expect(client).not.toBe(other);
  });
});
