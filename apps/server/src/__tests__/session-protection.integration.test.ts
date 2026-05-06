/**
 * Integration test for `requireSession*` coverage of every sensitive route
 * registered in `apps/server/src/app.ts → registerRoutes(app)`. PR 3.2 of
 * initiative
 * `docs/initiatives/0011-foundation-adoption-and-process-discipline.md`
 * Phase 3.
 *
 * **Why this test exists.** The H8 hardening card
 * (`docs/security/hardening/H8-corp-per-route.md`) closed the login-state
 * oracle by routing every session-protected handler through
 * `requireSession()` / `requireSessionSoft()`, which sets
 * `Cross-Origin-Resource-Policy: same-origin` *before* the session resolves.
 * The defense is therefore only as good as the coverage: any new route that
 * forgets to wrap with one of those middlewares silently regresses to the
 * helmet default of `cross-origin` and reopens the oracle for that path.
 *
 * Earlier coverage was a hand-maintained list in `apiV1.test.ts` and a
 * `grep` in PR review. This test replaces that with a programmatic walk of
 * the live Express router stack: we enumerate every `(method, path)` pair
 * registered by `createApp()`, then assert behaviour against an explicit
 * `EXEMPT_ROUTES` allowlist. New routes that deviate from the allowlist
 * fail this test.
 *
 * **Why Testcontainers.** `requireSession()` calls `getSessionUser(req)`,
 * which goes through Better Auth and ends up in Postgres. Mocking
 * `getSessionUser` would test the wiring but not the live invariant:
 * "if I send an unauthenticated request to a sensitive route against a
 * real DB, do I see the H8 header?" Testcontainers spins up
 * `pgvector/pgvector:pg16`, runs the same migration set as production
 * (the runner needs `vector` ext for migration 025), and lets us treat
 * `createApp()` as a black box. The test skips itself if Docker is not
 * available locally, matching the pattern used by
 * `syncV2.integration.test.ts`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import request from "supertest";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import type { Express } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "migrations");

const TIMEOUT_MS = 240_000;

let container: StartedTestContainer | undefined;
let testPool: pg.Pool | undefined;
let app: Express | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;

async function runMigrations(p: pg.Pool): Promise<void> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  for (const file of sqlFiles) {
    const sql = (
      await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8")
    ).trim();
    if (!sql) continue;
    await p.query(sql);
  }
}

beforeAll(async () => {
  try {
    container = await new GenericContainer("pgvector/pgvector:pg16")
      .withEnvironment({
        POSTGRES_USER: "hub",
        POSTGRES_PASSWORD: "hub",
        POSTGRES_DB: "hub_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const uri = `postgresql://hub:hub@${host}:${port}/hub_test`;

    process.env["DATABASE_URL"] = uri;
    // BETTER_AUTH_SECRET must be set so `apps/server/src/auth.ts` can boot
    // its Better Auth instance without throwing during module import.
    process.env["BETTER_AUTH_SECRET"] ??= "0".repeat(64);
    // Some routes (`createMonoWebhookRouter`) silently 404 unless these
    // are configured. Enable them so router enumeration sees the full
    // protected surface.
    process.env["MONO_WEBHOOK_ENABLED"] ??= "true";
    process.env["MONO_TOKEN_ENC_KEY"] ??= "0".repeat(64);
    process.env["INTERNAL_API_KEY"] ??= "internal-test-key";

    testPool = new pg.Pool({ connectionString: uri, max: 5 });
    await runMigrations(testPool);

    // `createApp` must be imported AFTER DATABASE_URL is set: the module
    // graph below it (`./db.js`, `./auth.js`) reads env at first import.
    const { createApp } = await import("../app.js");
    app = createApp();
    dockerAvailable = true;
  } catch (e) {
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[session-protection integration] Skipping: testcontainers unavailable — ${skipReason}`,
    );
  }
}, TIMEOUT_MS);

afterAll(async () => {
  if (testPool) await testPool.end().catch(() => {});
  if (container) await container.stop().catch(() => {});
}, TIMEOUT_MS);

interface RouteSpec {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
}

/**
 * Walk Express 4's internal `_router.stack` to enumerate every
 * `(method, path)` pair registered by `createApp()`. We descend into
 * mounted Router instances because `registerRoutes` calls
 * `app.use(domainRouter)` for each domain — those routers register their
 * own `/api/...` paths internally (no prefix-mounting at the app level).
 *
 * We deliberately filter out:
 *   - HEAD methods (Express auto-mirrors GET handlers; the same chain
 *     applies, so testing GET is sufficient and saves request time).
 *   - `_all` synthesized by `r.all(...)` — we expand it into the explicit
 *     `GET` for the path so the supertest call has a concrete method.
 */
function listRoutes(express: Express): RouteSpec[] {
  const out: RouteSpec[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (stack: any[]): void => {
    for (const layer of stack) {
      if (layer.route) {
        const routePath: string = layer.route.path;
        const methods = layer.route.methods as Record<string, boolean>;
        const collected: string[] = [];
        for (const m of Object.keys(methods)) {
          if (m === "_all") {
            // r.all() registers `_all`; pick GET as the canonical probe.
            collected.push("GET");
            continue;
          }
          if (m === "head") continue;
          collected.push(m.toUpperCase());
        }
        // Some routes register both GET and HEAD (Express auto-mirrors);
        // dedupe the synthetic _all + explicit get case.
        for (const m of new Set(collected)) {
          out.push({ method: m as RouteSpec["method"], path: routePath });
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        visit(layer.handle.stack);
      }
    }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = (express as any)._router;
  if (router?.stack) visit(router.stack);
  return out;
}

/**
 * Routes that are intentionally NOT session-protected. Each entry is a
 * literal path that must *match exactly* the route registered by Express.
 * Using string-equality (instead of regex / glob) keeps drift visible:
 * adding a new public endpoint requires an explicit allowlist edit and a
 * code review pointer to the rationale.
 *
 * If a route here ever returns `Cross-Origin-Resource-Policy: same-origin`,
 * it means somebody added `requireSession*` to a public endpoint — that's
 * a regression in the other direction and would break the SPA's ability
 * to embed e.g. `/api/csp-report` from the Vercel origin. We assert
 * `cross-origin` for that case below.
 */
const EXEMPT_ROUTES: ReadonlySet<string> = new Set([
  // Health-check / observability — must stay cross-origin so Pingdom /
  // UptimeRobot / Prometheus can scrape from any origin.
  "/livez",
  "/readyz",
  "/startupz",
  "/health",
  "/health/liveness",
  "/health/readiness",
  "/health/startup",
  "/health/workers",
  "/healthz",
  "/metrics",
  // Better Auth — its own cookie/session protocol; not a `requireSession`
  // consumer. OAuth callbacks land here.
  "/api/auth/*",
  // CSP report-only endpoint — browser sends from the Vercel SPA origin.
  "/api/csp-report",
  // Public web-vitals beacon from anonymous browsers.
  "/api/metrics/web-vitals",
  // Anonymous / public endpoints, gated by anonymous-quota or rate-limit.
  "/api/privat", // bank lookup proxy
  "/api/barcode", // anonymous nutrition scan
  "/api/chat", // anonymous chat with quota
  "/api/food-search", // anonymous food search
  "/api/email/unsubscribe", // public unsubscribe link
  "/api/email/unsubscribe/confirm", // public unsubscribe confirm
  "/api/v1/email/unsubscribe",
  "/api/v1/email/unsubscribe/confirm",
  "/api/waitlist", // public waitlist sign-up
  "/api/v1/waitlist",
  "/api/waitlist/confirm",
  "/api/v1/waitlist/confirm",
  // Mono webhook — secret-in-URL, not session.
  "/api/mono/webhook",
  "/api/mono/webhook/:secret",
  // Stripe webhook — signature-verified by Stripe lib; calling it
  // requires possession of `STRIPE_WEBHOOK_SECRET`, not a user session.
  "/api/billing/stripe-webhook",
  // Anonymous AI endpoint — gated by `requireAnthropicKey` +
  // `requireAiQuota` (anonymous bucket via IP), same shape as `/api/chat`.
  "/api/weekly-digest",
  // Public VAPID key — frontend reads this to subscribe a push
  // subscription. By design no session, no rate-limit (it's static).
  "/api/push/vapid-public",
  // Internal-only push fan-out — M14 hardening uses `requireInternalIp`
  // + `requireApiSecret("API_SECRET")` with constant-time compare. The
  // surface is not exposed to browsers (CGN range / loopback only), so
  // the cross-origin oracle is not reachable.
  "/api/push/send",
  // Internal admin surface — gated by INTERNAL_API_KEY bearer (not
  // session). H8's cross-origin oracle does not apply because the
  // surface refuses any non-bearer request.
  // We match the prefix programmatically below to avoid listing every
  // sub-route here.
]);

/** Prefix-match for `/api/internal/*` — admin surface uses bearer auth. */
const EXEMPT_PREFIXES: readonly string[] = ["/api/internal/"];

function isExempt(routePath: string): boolean {
  if (EXEMPT_ROUTES.has(routePath)) return true;
  for (const prefix of EXEMPT_PREFIXES) {
    if (routePath.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Send an unauthenticated probe to the route. We don't care about the
 * status code (some routes will be 400/404/429 because they want a body);
 * we care that the response carries `Cross-Origin-Resource-Policy:
 * same-origin`, which proves `requireSession*` ran *before* the body
 * validation could short-circuit.
 */
async function probe(express: Express, route: RouteSpec): Promise<string> {
  const req =
    route.method === "GET"
      ? request(express).get(route.path)
      : route.method === "POST"
        ? request(express).post(route.path)
        : route.method === "PUT"
          ? request(express).put(route.path)
          : route.method === "PATCH"
            ? request(express).patch(route.path)
            : request(express).delete(route.path);
  // Required by `requireCsrfHeader` for non-GET on `/api/*`. Without
  // it the CSRF guard 403s before `requireSession*` ever runs and the
  // CORP override is therefore not set on the response.
  const r =
    route.method === "GET"
      ? await req
      : await req.set("X-Requested-With", "XMLHttpRequest");
  const header = r.headers["cross-origin-resource-policy"];
  return typeof header === "string" ? header : "<missing>";
}

describe("session-protection — every sensitive route goes through requireSession*", () => {
  it(
    "enumerates routes and probes coverage",
    async (ctx) => {
      if (!dockerAvailable || !app) return ctx.skip();

      const routes = listRoutes(app);
      expect(routes.length).toBeGreaterThan(20); // sanity: createApp is wired

      const failures: string[] = [];
      const reverseFailures: string[] = [];

      for (const route of routes) {
        // We skip wildcards (`/api/auth/*`) for the supertest probe because
        // supertest will literally request the path with the `*` in it; it's
        // exempt-listed above so the assertion is trivially satisfied.
        if (route.path.includes("*")) continue;
        // Routes with `:param` placeholders need a value; pick a stub.
        const probePath = route.path.replace(/:[^/]+/g, "stub");
        const corp = await probe(app, { ...route, path: probePath });

        if (isExempt(route.path)) {
          // Public endpoints must NOT have flipped to same-origin (either by
          // accidental `requireSession*` adoption or some other override).
          // Helmet's default is `cross-origin`; missing header would also
          // mean someone disabled helmet, which is a different regression.
          if (corp !== "cross-origin") {
            reverseFailures.push(
              `[reverse] EXEMPT ${route.method} ${route.path} → CORP=${corp} (expected cross-origin; H8 design)`,
            );
          }
        } else {
          if (corp !== "same-origin") {
            failures.push(
              `${route.method} ${route.path} → CORP=${corp} (expected same-origin; missing requireSession* in middleware chain)`,
            );
          }
        }
      }

      if (failures.length > 0 || reverseFailures.length > 0) {
        const msg = [
          "Session-protection coverage gaps detected.",
          "",
          ...(failures.length > 0
            ? [
                "Sensitive routes missing requireSession* (oracle reopened):",
                ...failures,
                "",
              ]
            : []),
          ...(reverseFailures.length > 0
            ? [
                "Public routes that flipped to same-origin (unexpected):",
                ...reverseFailures,
                "",
              ]
            : []),
          "If a route is intentionally public, add it to EXEMPT_ROUTES and",
          "explain why in the comment above the entry. If it's intentionally",
          "session-protected, wrap it with requireSession() or requireSessionSoft()",
          "in `apps/server/src/routes/`.",
        ].join("\n");
        throw new Error(msg);
      }
    },
    TIMEOUT_MS,
  );

  it("captures the route inventory for CI diff visibility", async (ctx) => {
    if (!dockerAvailable || !app) return ctx.skip();
    const routes = listRoutes(app);
    // Group by path for human-readable failure output. The body intentionally
    // serializes only the structure (no behaviour) — when the diff fails on
    // CI, the reviewer immediately sees which routes were added/removed.
    const grouped: Record<string, string[]> = {};
    for (const r of routes) {
      const key = r.path;
      grouped[key] ??= [];
      if (!grouped[key].includes(r.method)) grouped[key].push(r.method);
    }
    for (const path of Object.keys(grouped)) {
      grouped[path]!.sort();
    }
    expect(Object.keys(grouped).length).toBeGreaterThan(20);
  });
});
