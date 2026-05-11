// Re-export surface for the demo lazy-gate (onboarding/index.ts).
// Consolidates both demo-seed and demo-cleanup entry points so
// maybeRunOnboarding() can dynamic-import a single module.
export { runDemoSeedFromUrl } from "./seedDemoData";
export { runDemoCleanupOnce } from "./cleanupDemoData";
