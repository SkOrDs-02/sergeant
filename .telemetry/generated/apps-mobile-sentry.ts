/**
 * Mobile Sentry init. Currently MISSING in apps/mobile/ —
 * `@sentry/react-native` is declared in package.json but never initialised,
 * so mobile crashes do not reach Sentry.
 *
 * Mirrors the sampling profile from apps/web/src/core/observability/sentry.ts:
 *   - 100% sampling on /onboarding
 *   - 5% baseline in production
 *   - 0% in development
 *
 * Target location: apps/mobile/src/lib/observability/sentry.ts
 */
import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

let initialized = false;

function readEnv(key: string): string | undefined {
  // Expo env access — `process.env.EXPO_PUBLIC_*` is statically replaced at build.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (process.env as Record<string, string | undefined>)[key];
}

export function initSentry(): void {
  if (initialized) return;
  const dsn = readEnv("EXPO_PUBLIC_SENTRY_DSN");
  if (!dsn) {
    initialized = true; // mark as "tried" so we don't retry on every render
    return;
  }

  const release = readEnv("EXPO_PUBLIC_RELEASE");
  const isDev = __DEV__;

  Sentry.init({
    dsn,
    environment: isDev ? "development" : "production",
    release,
    sendDefaultPii: false,
    enableNative: true,
    tracesSampler: ({ name }) => {
      if (isDev) return 0;
      if (typeof name === "string") {
        if (name.startsWith("/onboarding")) return 1.0;
        if (name.startsWith("/finyk") || name.startsWith("/fizruk")) return 0.5;
      }
      return 0.05;
    },
    beforeSend: (event) => {
      if (event.request) {
        const req = event.request as Record<string, unknown>;
        delete req.data;
        delete req.cookies;
      }
      return event;
    },
  });

  Sentry.setTag("platform", Platform.OS);
  initialized = true;
}

/** Test-only. */
export function __resetSentryInitForTests(): void {
  initialized = false;
}
