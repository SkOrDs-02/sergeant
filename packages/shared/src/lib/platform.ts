/**
 * Platform feature-detect.
 *
 * Intentionally DOM-free and with NO compile-time dependency on
 * `@capacitor/core`: it reads the `Capacitor` global that the Capacitor
 * runtime injects into the WebView. This keeps `@sergeant/shared`
 * installable by the browser build without pulling `@capacitor/*`
 * into the web bundle.
 *
 * - In a browser, no global is present → returns `false`.
 * - Inside a Capacitor WebView (Android/iOS), the native runtime exposes
 *   `window.Capacitor` with `isNativePlatform()` / `getPlatform()`.
 *
 * Consumers that need the real Capacitor API (plugins) must dynamic-import
 * from `@sergeant/mobile-shell` (or a sibling package) so the import is
 * code-split out of the main web chunk.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function getCapacitorGlobal(): CapacitorGlobal | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const g = globalThis as unknown as { Capacitor?: CapacitorGlobal };
  return g.Capacitor;
}

export function isCapacitor(): boolean {
  const cap = getCapacitorGlobal();
  return typeof cap?.isNativePlatform === "function"
    ? cap.isNativePlatform()
    : false;
}

export type NativePlatform = "ios" | "android";
export type Platform = NativePlatform | "web";

export function getPlatform(): Platform {
  const cap = getCapacitorGlobal();
  const p = typeof cap?.getPlatform === "function" ? cap.getPlatform() : "web";
  return p === "ios" || p === "android" ? p : "web";
}
