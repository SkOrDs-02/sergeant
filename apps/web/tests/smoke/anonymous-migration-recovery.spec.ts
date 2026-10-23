import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Request,
} from "@playwright/test";
import type { SyncV2PullResponse, SyncV2PushOp } from "@sergeant/api-client";
import { seedFTUX } from "../utils/seedFTUX";
import { waitForServiceWorkerActivated } from "../utils/serviceWorker";
import { waitForSqliteRefreshAfter } from "../utils/sqliteRefresh";
import { HUB_USER_AUTH_STATE } from "./authState";
import {
  collectPageErrors,
  settleToasts,
  waitForInitialSqliteRefresh,
} from "./smokeHelpers";

// Real preview, OPFS/SAH-pool, service worker, Better Auth and Postgres.
// Only the interrupted-push case injects a transport failure, never an ACK.
// Acceptance: docs/work/specs/anonymous-local-first-persistence.md.
test.use({ storageState: { cookies: [], origins: [] } });
const SUCCESS = "Дані перенесено й безпечно збережено у профілі.";
const API = process.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:3000";

async function showExpense(page: Page, title: string) {
  await expect(async () => {
    const toggle = page.getByRole("button", {
      name: /(Розгорнути|Згорнути) Сьогодні/,
    });
    const label = (await toggle.getAttribute("aria-label")) ?? "";
    if (label.includes("Розгорнути")) await toggle.click();
    await expect(page.getByText(title, { exact: true })).toBeVisible({
      timeout: 1500,
    });
  }).toPass({ timeout: 60_000 });
  await expect(page.getByText(title, { exact: true })).toHaveCount(1);
}

async function requireControlledShell(page: Page) {
  const result = await waitForServiceWorkerActivated(page);
  if (result !== "controlling") {
    // Read-only failure evidence; no worker instrumentation or timing changes.
    const snapshot = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const names = await caches.keys();
      return {
        readyState: document.readyState,
        isolated: crossOriginIsolated,
        controller: navigator.serviceWorker.controller?.state ?? null,
        active: registration?.active?.state ?? null,
        installing: registration?.installing?.state ?? null,
        waiting: registration?.waiting?.state ?? null,
        cacheEntries: await Promise.all(
          names.map(
            async (name) => (await (await caches.open(name)).keys()).length,
          ),
        ),
      };
    });
    await test.info().attach("service-worker-readiness", {
      body: JSON.stringify(snapshot),
      contentType: "application/json",
    });
  }
  expect(result).toBe("controlling");
}

async function bootAnonymous(page: Page) {
  expect(await page.context().cookies()).toEqual([]);
  await seedFTUX(page, "post-ftux", {
    extra: { finyk_manual_only_v1: "1" },
  });
  const me = page.waitForResponse(
    (r) =>
      /\/api(\/v\d+)?\/me(\?|$)/.test(r.url()) &&
      r.request().method() === "GET",
  );
  await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  expect((await me).status()).toBe(401);
  await expect(
    page.getByTestId("corner-action").getByRole("button", { name: "Додати" }),
  ).toBeVisible();
  // SQL completion is proved by the write barrier below, not a boot counter.
  // Offline restart must exercise a controlled, precached shell, not HTTP cache.
  await requireControlledShell(page);
}

async function addExpense(page: Page, title: string) {
  await settleToasts(page);
  await page
    .getByTestId("corner-action")
    .getByRole("button", { name: "Додати" })
    .click();
  await page
    .getByTestId("add-sources")
    .getByRole("button", { name: /^Вручну/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Додати витрату" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("Сума ₴").fill("89");
  await page.getByLabel("Назва").fill(title);
  await settleToasts(page);
  await waitForSqliteRefreshAfter(page, "finyk", async () => {
    await dialog
      .getByRole("button", { name: "Додати витрату", exact: true })
      .click();
  });
  await expect(dialog).toBeHidden();
  await showExpense(page, title);
}

async function restart(page: Page) {
  await requireControlledShell(page);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
  } catch (error) {
    // Existing smoke convention: retry only an aborted navigation, not failures.
    if (!String(error).includes("ERR_ABORTED")) throw error;
    await page.reload({ waitUntil: "domcontentloaded" });
  }
}

async function openRegistration(page: Page) {
  await requireControlledShell(page);
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Немає акаунту? Зареєструватися" })
    .click();
  const nonce = crypto.randomUUID();
  await page.fill("#auth-name", "Anonymous Recovery Smoke");
  await page.fill("#auth-email", `anon_recovery_${nonce}@example.com`);
  await page.fill("#auth-password", `pw_${nonce}_long_enough`);
}

async function registerAndMigrate(page: Page) {
  await openRegistration(page);
  await Promise.all([
    page.getByText(SUCCESS, { exact: true }).waitFor({ timeout: 60_000 }),
    page.getByRole("button", { name: "Зареєструватися", exact: true }).click(),
  ]);
}

async function remoteExpenseOps(context: BrowserContext, title: string) {
  const response = await context.request.get(`${API}/api/v2/sync/pull?since=0`);
  expect(response.status()).toBe(200);
  const data = (await response.json()) as SyncV2PullResponse;
  // Each account is fresh; no pagination or origin-device filtering here.
  expect(data.next_cursor).toBeNull();
  return data.ops.filter(
    (op) =>
      op.table === "finyk_manual_expenses" &&
      JSON.stringify(op.row).includes(title),
  );
}

function matchingPushOps(request: Request, title: string): SyncV2PushOp[] {
  if (
    new URL(request.url()).pathname !== "/api/v2/sync/push" ||
    request.method() !== "POST"
  )
    return [];
  const body = request.postDataJSON() as { ops: SyncV2PushOp[] };
  return body.ops.filter(
    (op) =>
      op.table === "finyk_manual_expenses" &&
      JSON.stringify(op.row).includes(title),
  );
}

test("@critical anonymous: запис офлайн переживає reload в OPFS і після reconnect підтверджується сервером", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await collectPageErrors(page);
  const title = `ANON offline ${crypto.randomUUID()}`;
  await bootAnonymous(page);
  const context = page.context();
  try {
    await context.setOffline(true);
    await page
      .getByRole("button", { name: /Відкрити деталі синхронізації/ })
      .click();
    const details = page.getByRole("dialog", { name: "Синхронізація" });
    // This is the actual active VFS, not merely OPFS API availability.
    await expect(
      details.getByText("Файлове сховище браузера", { exact: true }),
    ).toBeVisible();
    await details.getByRole("button", { name: "Закрити", exact: true }).click();
    await addExpense(page, title);
    await restart(page);
    await waitForInitialSqliteRefresh(page, "finyk");
    await showExpense(page, title);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  } finally {
    await context.setOffline(false);
  }
  await registerAndMigrate(page);
  await expect
    .poll(async () => (await remoteExpenseOps(context, title)).length)
    .toBe(1);
  await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "finyk");
  await showExpense(page, title);
  expect(errors).toEqual([]);
});

test("@critical anonymous: reload після перерваного push відновлює перенос з тим самим idempotency key", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await collectPageErrors(page);
  const title = `ANON interrupted ${crypto.randomUUID()}`;
  await bootAnonymous(page);
  await addExpense(page, title);
  const keys: string[] = [];
  page.on("request", (request) => {
    keys.push(
      ...matchingPushOps(request, title).map((op) => op.idempotency_key),
    );
  });
  let interrupted = false;
  let resuming = false;
  // Push несе `?sync_protocol=` (data-48), тож glob без query його не ловить.
  const isPush = (url: URL) => url.pathname === "/api/v2/sync/push";
  await page.route(isPush, async (route) => {
    if (!resuming && matchingPushOps(route.request(), title).length > 0) {
      interrupted = true;
      await route.abort("connectionfailed");
    } else {
      await route.continue();
    }
  });
  await openRegistration(page);
  const failedPush = page.waitForEvent("requestfailed", {
    predicate: (request) => matchingPushOps(request, title).length > 0,
    timeout: 60_000,
  });
  await page
    .getByRole("button", { name: "Зареєструватися", exact: true })
    .click();
  await failedPush;
  expect(interrupted).toBe(true);
  // Keep every retry blocked until the new document is loaded. Otherwise
  // the old document could finish the transfer just before the restart.
  page.once("domcontentloaded", () => {
    resuming = true;
  });
  // The pending claim/outbox must survive a real document/worker restart.
  await restart(page);
  await page.getByText(SUCCESS, { exact: true }).waitFor({ timeout: 60_000 });
  expect(keys.length).toBeGreaterThanOrEqual(2);
  expect(new Set(keys).size).toBe(1);
  await expect
    .poll(async () => (await remoteExpenseOps(page.context(), title)).length)
    .toBe(1);
  await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "finyk");
  await showExpense(page, title);
  expect(errors).toEqual([]);
});

test("@critical anonymous: інший браузер отримує перенесений запис, інший акаунт його не бачить", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const title = `ANON devices ${crypto.randomUUID()}`;
  await bootAnonymous(page);
  await addExpense(page, title);
  await registerAndMigrate(page);
  await expect
    .poll(async () => (await remoteExpenseOps(page.context(), title)).length)
    .toBe(1);
  // Cookies only: the second device has no source OPFS, localStorage or cache.
  const baseURL = new URL(page.url()).origin;
  const owner = await browser.newContext({
    baseURL,
    storageState: { cookies: await page.context().cookies(), origins: [] },
  });
  const other = await browser.newContext({
    baseURL,
    storageState: HUB_USER_AUTH_STATE,
  });
  try {
    const second = await owner.newPage();
    await seedFTUX(second, "post-ftux", {
      extra: { finyk_manual_only_v1: "1" },
    });
    await second.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
    // The acceptance signal is the server row appearing on an empty device.
    // A refresh-counter precondition can reject a cold boot before that happens.
    await showExpense(second, title);
    const foreign = await other.newPage();
    await seedFTUX(foreign, "post-ftux", {
      extra: { finyk_manual_only_v1: "1" },
    });
    await foreign.goto("/finyk/transactions", {
      waitUntil: "domcontentloaded",
    });
    // A visible own row proves B's module is loaded and reading its partition.
    await addExpense(foreign, `OTHER ${crypto.randomUUID()}`);
    await expect(foreign.getByText(title, { exact: true })).toHaveCount(0);
    expect(await remoteExpenseOps(other, title)).toEqual([]);
  } finally {
    await owner.close();
    await other.close();
  }
});
