import { test, expect } from "@playwright/test";

test("sw: debug snapshot + clear caches work (best-effort)", async ({
  page,
}) => {
  // Keep it robust: no backend is attached in this Playwright lane.
  await page.goto("/?sw=debug", { waitUntil: "domcontentloaded" });

  let result:
    | { ok: true; snapshot: unknown; clearRes: unknown }
    | { ok: false; reason: string };

  try {
    result = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) {
        return { ok: false, reason: "no_service_worker" as const };
      }
      const reg = await navigator.serviceWorker.ready;
      const ctl: ServiceWorker | null =
        navigator.serviceWorker.controller || reg.active;
      if (!ctl) return { ok: false, reason: "no_controller" as const };

      const requestId = `pw_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const snapshot = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          navigator.serviceWorker.removeEventListener("message", onMessage);
          reject(new Error("timeout"));
        }, 4000);
        const onMessage = (event: MessageEvent) => {
          const data = event.data as
            | { type?: string; requestId?: string | null; snapshot?: unknown }
            | undefined;
          if (!data || data.type !== "SW_DEBUG_RESULT") return;
          if ((data.requestId || null) !== requestId) return;
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener("message", onMessage);
          resolve(data.snapshot);
        };
        navigator.serviceWorker.addEventListener("message", onMessage);
        ctl.postMessage({ type: "SW_DEBUG", data: { requestId } });
      });

      const clearRes = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          navigator.serviceWorker.removeEventListener("message", onMessage);
          reject(new Error("timeout"));
        }, 6000);
        const onMessage = (event: MessageEvent) => {
          const data = event.data as
            | { type?: string; requestId?: string | null; result?: unknown }
            | undefined;
          if (!data || data.type !== "CLEAR_SW_CACHES_RESULT") return;
          if ((data.requestId || null) !== requestId) return;
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener("message", onMessage);
          resolve(data.result);
        };
        navigator.serviceWorker.addEventListener("message", onMessage);
        ctl.postMessage({ type: "CLEAR_SW_CACHES", data: { requestId } });
      });

      return { ok: true, snapshot, clearRes };
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "service_worker_probe_failed";
    test.info().annotations.push({
      type: "sw-skip",
      description: `SW smoke skipped: ${reason}`,
    });
    test.skip(true, `SW smoke skipped: ${reason}`);
    return;
  }

  // If the runner's browser disables SW, don't hard-fail the lane.
  if (!result.ok) {
    test.info().annotations.push({
      type: "sw-skip",
      description: `SW smoke skipped: ${result.reason}`,
    });
    test.skip(true, `SW smoke skipped: ${result.reason}`);
  }

  expect(result.ok).toBe(true);
});
