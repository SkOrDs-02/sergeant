import { safeReadStringLS } from "@shared/lib/storage/storage";
import { DEMO_FLAG_KEY } from "./seedDemoData/keys";

// Lazy-gate for demo seed + onboarding URL-triggered imports.
//
// Only loads the demo bundle when the URL carries ?demo / ?welcome, or
// when the store is already in demo mode (so each cold-start restores a
// clean example). On a normal non-demo cold-start this returns in <1ms
// after a single synchronous flag read, without touching the seeding
// code — keeps the critical-path bundle clean. `keys` is a constants-
// only module, so importing the flag here does not pull in the seeders.
export async function maybeRunOnboarding(): Promise<void> {
  const url = new URL(window.location.href);
  const hasDemoParam = url.searchParams.has("demo");
  const hasWelcome = url.searchParams.has("welcome");
  // Cheap flag read keeps the non-demo cold-start off the demo bundle.
  const inDemo = safeReadStringLS(DEMO_FLAG_KEY) === "1";

  if (!hasDemoParam && !hasWelcome && !inDemo) return;

  const { runDemoSeedFromUrl, runDemoCleanupOnce, reseedDemoData } =
    await import("./demoSeed.js");

  if (url.searchParams.get("demo") === "reset") {
    runDemoCleanupOnce();
  } else if (hasDemoParam) {
    // F15 (браузерна верифікація 2026-08-06): `?demo=1` поверх активної
    // сесії давав змішаний стан — демо-банер і часткові демо-дані поряд
    // зі справжнім акаунтом. Сід — лише для гостя; для залогіненого
    // прибираємо параметр і виходимо. Запит один і лише на цьому
    // рідкісному шляху — швидкий не-демо cold-start його не бачить.
    const session = await fetch("/api/auth/get-session")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (session?.user) {
      url.searchParams.delete("demo");
      window.history.replaceState(null, "", url.toString());
      return;
    }
    runDemoSeedFromUrl();
  } else if (inDemo) {
    // Drift reset: already in demo mode, no explicit handshake in the
    // URL — restore the canonical sample over whatever the visitor
    // edited last session.
    reseedDemoData();
  }
}
