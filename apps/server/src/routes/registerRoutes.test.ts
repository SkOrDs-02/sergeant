import express, { type Express } from "express";
import { describe, expect, it, vi } from "vitest";

/**
 * Snapshot-тест `registerRoutes`: фіксує повний набір HTTP-шляхів,
 * які монтуються на Express-app після послідовного виклику всіх
 * доменних router-factory-ів (див. `apps/server/src/routes/index.ts`).
 *
 * Мета — ловити мовчазні регресії: випадкове видалення роутера,
 * перейменування шляху, або зміну HTTP-методу. OpenAPI-spec під
 * `docs/api/openapi.json` покриває лише ті шляхи, що ми явно
 * документуємо (див. `packages/shared/src/openapi/routes.ts`), а цей
 * тест ловить і внутрішні (/api/internal/*), і health-роути, що
 * навмисно не експонуються у spec-і.
 *
 * Якщо snapshot падає:
 *  - якщо шлях ДОДАНО навмисно (новий endpoint) — оновити snapshot
 *    через `vitest -u` і переконатися, що OpenAPI route теж додано
 *    (Hard Rule #3 — API contract: server ↔ api-client ↔ spec).
 *  - якщо шлях ЗНИКНУВ навмисно (видалений endpoint) — знов `-u`,
 *    і прибрати відповідний запис з OpenAPI routes + `api-client`.
 *
 * DB / external deps мокаються — цікавить лише wiring.
 */

const { mockPool } = vi.hoisted(() => {
  const queryMock = vi.fn().mockResolvedValue({ rows: [] });
  return {
    mockPool: {
      query: queryMock,
      connect: vi.fn(),
      on: vi.fn(),
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    },
  };
});

vi.mock("./../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: mockPool.query,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: vi.fn().mockResolvedValue(null),
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
  handle?: {
    stack?: RouteLayer[];
  };
  regexp?: RegExp;
}

type ExpressAppWithRouter = Express & {
  _router?: { stack?: RouteLayer[] };
};

function collectRoutes(
  stack: RouteLayer[] | undefined,
  prefix = "",
): Array<{ method: string; path: string }> {
  if (!stack) return [];
  const results: Array<{ method: string; path: string }> = [];
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .filter((m) => layer.route!.methods[m])
        .map((m) => m.toUpperCase());
      for (const method of methods) {
        results.push({ method, path: prefix + layer.route.path });
      }
    } else if (layer.handle?.stack) {
      results.push(...collectRoutes(layer.handle.stack, prefix));
    }
  }
  return results;
}

function extractRoutes(app: Express): string[] {
  // Express 4 exposes `_router` after the first `.use()` call.
  const rootStack = (app as ExpressAppWithRouter)._router?.stack;
  const routes = collectRoutes(rootStack);
  // Normalize: sort by "METHOD path" — snapshot-stable across router shuffle.
  return routes
    .map((r) => `${r.method} ${r.path}`)
    .sort((a, b) => a.localeCompare(b));
}

describe("registerRoutes", () => {
  it("mounts the stable set of /api/* endpoints (snapshot)", async () => {
    // Required env for routers that throw on missing config during module init.
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.BETTER_AUTH_SECRET = "x".repeat(32);
    process.env.INTERNAL_API_KEY = "internal-test";

    const { registerRoutes } = await import("./index.js");
    const app = express();
    registerRoutes(app, { pool: mockPool as never });

    const routes = extractRoutes(app);

    // Snapshot the full path set. If this fails, see the header comment above
    // for resolution steps (Hard Rule #3 — API contract must move together).
    expect(routes).toMatchSnapshot();
  });
});
