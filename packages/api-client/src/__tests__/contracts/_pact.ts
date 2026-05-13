// Shared Pact configuration for `@sergeant/api-client` consumer-contract
// tests. One PactV4 builder per test file — each test file's interactions
// merge into the single pact file
// `pacts/sergeant-api-client-sergeant-server.json` (Pact's contract is
// one file per `(consumer, provider)` pair).
//
// Background: PR-42 (docs/planning/pr-plan-2026-05.md). Pact contract
// testing complements OpenAPI sync (Hard Rule #3 / `pnpm api:check-openapi`)
// with **runtime** consumer-driven contracts: the api-client describes
// every interaction it makes, the server replays the pact against its
// route factories in CI (`apps/server/src/__tests__/contracts/`).

import { fileURLToPath } from "node:url";
import path from "node:path";
import { PactV4, SpecificationVersion } from "@pact-foundation/pact";

/**
 * Consumer name. Single canonical value — every persona-specific test
 * (finyk/fizruk/nutrition/hub/etc.) shares the same consumer so all
 * interactions land in one pact file.
 */
export const CONSUMER = "sergeant-api-client";
/** Provider name — matches `apps/server`. */
export const PROVIDER = "sergeant-server";

/**
 * Absolute path to `packages/api-client/pacts/`. Resolved from this
 * file's URL so it works under any cwd / Vitest pool config.
 */
export const PACT_DIR = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../pacts",
);

/**
 * Factory for a per-file `PactV4` builder. Each consumer test file
 * creates one in `beforeAll` and shares it across `it()`s.
 *
 * Spec V3 (not V4): V3 is what the server-side verifier currently
 * understands across the broker / `Verifier` matrix without plugin
 * gymnastics, and we don't need V4-only features (sync messages,
 * GraphQL) for HTTP REST contracts.
 */
export function createPact(): PactV4 {
  return new PactV4({
    consumer: CONSUMER,
    provider: PROVIDER,
    dir: PACT_DIR,
    spec: SpecificationVersion.SPECIFICATION_VERSION_V3,
    // `warn` keeps the Pact FFI quiet during normal CI runs; bump to
    // `debug` locally when an interaction is unexpectedly failing.
    logLevel: "warn",
  });
}
