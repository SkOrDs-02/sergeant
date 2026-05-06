import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./msw/server";
import { afterAll, afterEach, beforeAll } from "vitest";

// `@testing-library/react` only auto-cleans when `globals: true` is set in
// vitest config; this monorepo opts out of globals (see
// `apps/web/vitest.config.js`), so the auto-hook never installs and DOM
// nodes from the previous test leak into the next one — which made
// `WhatsNewModal.test.tsx` fail with "Found multiple elements with the
// role 'button' and name 'Спробувати'" once the third test rendered into
// a DOM that already contained two prior modal copies. Hooking
// `cleanup()` here mirrors the standard testing-library setup pattern.
afterEach(() => cleanup());

// Wire MSW lifecycle: intercept outgoing requests in all test suites.
// Per-test overrides via `server.use(...)` are reset after each test.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
