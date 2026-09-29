/**
 * Єдиний API-роутер E2E-світів і застосування локального стану через міст
 * `window.__sergeantScenario` (лише в білді з `VITE_E2E_SEED=true`).
 * Спека: `docs/work/specs/e2e-repeatable-states.md`.
 */
import { expect, test, type Page, type Request } from "@playwright/test";
import type { MonoBackfillProgress } from "@sergeant/api-client";

import type { ScenarioBridge } from "../../src/e2e/installScenarioBridge";
import {
  authSession,
  billingCheckout,
  billingStatus,
  getWorld,
  meResponse,
  monoAccounts,
  monoSyncState,
  monoTransactionsPage,
  silpoSyncState,
  systemStatus,
  type ScenarioWorld,
  type WorldId,
} from "../fixtures/worlds";
import { waitForServiceWorkerActivated } from "./serviceWorker";

export type WorldEndpoint =
  | "/auth/get-session"
  | "/me"
  | "/mono/sync-state"
  | "/mono/accounts"
  | "/mono/jars"
  | "/mono/transactions"
  | "/mono/backfill-progress"
  | "/silpo/sync-state"
  | "/billing/status"
  | "/billing/checkout"
  | "/status"
  | "/push/vapid-public";

export interface InstallWorldOptions {
  /**
   * Відповідати лише на ці ендпоінти, решту пустити в мережу. Для лейнів
   * з реальним сервером (smoke), де світ підміняє один недоступний виклик.
   */
  readonly only?: readonly WorldEndpoint[];
  /** URL, який повертає `POST /billing/checkout`. */
  readonly checkoutUrl?: string;
}

interface Reply {
  readonly status: number;
  readonly body: unknown;
}

const DEFAULT_CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_e2e";

function isApiPath(url: URL): boolean {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

/** `/api/v1/mono/accounts` → `/mono/accounts`: HttpClient додає версію сам. */
function endpointOf(url: URL): string {
  return url.pathname.replace(/^\/api(\/v\d+)?/, "");
}

function reply(
  world: ScenarioWorld,
  endpoint: string,
  request: Request,
  options: InstallWorldOptions,
): Reply | null {
  const url = new URL(request.url());
  switch (endpoint) {
    case "/auth/get-session":
      return { status: 200, body: authSession(world) };
    case "/me":
      return world.user
        ? { status: 200, body: meResponse(world.user) }
        : { status: 401, body: { ok: false, code: "UNAUTHENTICATED" } };
    case "/mono/sync-state":
      return { status: 200, body: monoSyncState(world) };
    case "/mono/accounts":
      return { status: 200, body: monoAccounts(world) };
    case "/mono/jars":
      return { status: 200, body: [] };
    case "/mono/transactions":
      return {
        status: 200,
        body: monoTransactionsPage(world, {
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        }),
      };
    case "/mono/backfill-progress":
      return {
        status: 200,
        body: {
          status: "idle",
          startedAt: null,
          completedAt: null,
          accountsTotal: 0,
          accountsProcessed: 0,
          currentAccountId: null,
          transactionsProcessed: 0,
          lastError: null,
        } satisfies MonoBackfillProgress,
      };
    case "/silpo/sync-state":
      return { status: 200, body: silpoSyncState(world) };
    case "/billing/status":
      return { status: 200, body: billingStatus() };
    case "/billing/checkout":
      return {
        status: 200,
        body: billingCheckout(options.checkoutUrl ?? DEFAULT_CHECKOUT_URL),
      };
    case "/status":
      return { status: 200, body: systemStatus() };
    case "/push/vapid-public":
      return { status: 200, body: { publicKey: "test-key" } };
    default:
      return null;
  }
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers()["origin"];
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
  };
}

/**
 * Предикат той самий, що був у `mockApi`: лише справжній `/api` на будь-якому
 * origin. Глоб `**\/api/**` уже раз ловив вихідники застосунку.
 */
export async function installWorld(
  page: Page,
  world: ScenarioWorld,
  options: InstallWorldOptions = {},
): Promise<void> {
  const only = options.only ? new Set<string>(options.only) : null;
  // Роут на контексті, а не на сторінці: після `reload` сторінку контролює
  // service worker, і запити, які він пересилає, `page.route` уже не бачить.
  await page.context().route(isApiPath, async (route) => {
    const request = route.request();
    const endpoint = endpointOf(new URL(request.url()));
    if (only && !only.has(endpoint)) {
      await route.fallback();
      return;
    }
    const headers = corsHeaders(request);
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const known = reply(world, endpoint, request, options);
    if (known) {
      await route.fulfill({
        status: known.status,
        headers,
        contentType: "application/json",
        body: JSON.stringify(known.body),
      });
      return;
    }
    // Невідомий шлях: генерична відповідь, як у колишньому `mockApi`.
    const isPost = request.method() === "POST";
    await route.fulfill({
      status: isPost ? 204 : 200,
      headers,
      contentType: "application/json",
      body: isPost ? "" : JSON.stringify({ ok: true }),
    });
  });
}

type BridgeWindow = Window & { __sergeantScenario?: ScenarioBridge };

/**
 * Застосовує світ: API-роутер, навігація, запис локального стану мостом,
 * `reload`, щоб екран перечитав канонічне сховище, і звірка `snapshot()`.
 */
export async function applyScenario(
  page: Page,
  id: WorldId,
  path: string,
): Promise<void> {
  // Два холодні бути (до і після `reload`) плюс запис: дефолтних 30 с замало.
  test.info().setTimeout(test.info().timeout + 60_000);
  const world = getWorld(id);
  await installWorld(page, world);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            typeof (window as BridgeWindow).__sergeantScenario?.apply ===
            "function",
        ),
      { message: "міст сценарію встановлено (VITE_E2E_SEED=true?)" },
    )
    .toBe(true);
  const applied = await page.evaluate(
    (local) => (window as BridgeWindow).__sergeantScenario!.apply(local),
    world.local,
  );
  expect(applied.scenario).toBe(id);

  await waitForServiceWorkerActivated(page, 10_000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as BridgeWindow).__sergeantScenario?.snapshot() ?? null,
        ),
      { message: `стан '${id}' осів після reload`, timeout: 20_000 },
    )
    .toMatchObject({
      scenario: id,
      pendingQueries: 0,
      pendingMutations: 0,
      sqliteReady: true,
    });
}
