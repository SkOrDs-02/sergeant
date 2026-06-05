/**
 * DSN / release / environment accessors split into their own module so
 * Jest can `jest.mock` the reads and drive `initObservability` through
 * both the DSN-set and DSN-absent branches in a single test file. At
 * production build time Expo's babel preset inlines the
 * `process.env.EXPO_PUBLIC_*` literals here — the inlined values are
 * the only things that ship.
 */

export function getSentryDsn(): string | undefined {
  return process.env.EXPO_PUBLIC_SENTRY_DSN;
}

export function getSentryRelease(): string | undefined {
  return process.env.EXPO_PUBLIC_SENTRY_RELEASE || undefined;
}

export function getSentryEnvironment(): string {
  return process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || "production";
}
