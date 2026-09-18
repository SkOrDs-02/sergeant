/**
 * Default MSW request handlers for apps/web tests.
 *
 * Keep this list minimal — only shared fallbacks that many test suites need.
 * Per-test overrides go in the test file via `server.use(...)`.
 *
 * URL patterns match the api-client prefix: `/api/v1/*` (default in tests
 * because `VITE_API_VERSION` is unset → "v1"). `apiPrefix` rewrite in
 * `httpClient.ts` transforms e.g. `/api/mono` → `/api/v1/mono`.
 */
import { http, HttpResponse } from "msw";

export const handlers = [
  // Fallback: unhandled API requests return 500 so tests fail fast
  // instead of hanging on network. Override per-test with server.use().
  http.all("*/api/v1/*", () => {
    return HttpResponse.json(
      { error: "MSW: no handler registered for this endpoint" },
      { status: 500 },
    );
  }),
];
