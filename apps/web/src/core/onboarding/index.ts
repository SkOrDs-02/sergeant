// Lazy-gate for demo seed + onboarding URL-triggered imports.
//
// Only loads the demo bundle when the URL carries ?demo or ?welcome.
// On a normal cold-start this returns in <1ms without touching the
// seeding code — keeps the critical-path bundle clean.
export async function maybeRunOnboarding(): Promise<void> {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("demo") && !url.searchParams.has("welcome")) return;

  const { runDemoSeedFromUrl, runDemoCleanupOnce } =
    await import("./demoSeed.js");

  if (url.searchParams.get("demo") === "reset") {
    runDemoCleanupOnce();
  } else if (url.searchParams.has("demo")) {
    runDemoSeedFromUrl();
  }
}
