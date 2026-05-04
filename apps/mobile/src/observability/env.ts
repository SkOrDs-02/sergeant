/**
 * PostHog env accessors for the mobile bundle.
 *
 * Split into its own module so Jest can `jest.mock` the reads and drive
 * `initPostHog` through both the key-set and key-absent branches in a
 * single test file. At production build time Expo's babel preset
 * inlines the `process.env.EXPO_PUBLIC_POSTHOG_KEY` /
 * `EXPO_PUBLIC_POSTHOG_HOST` literals here — the inlined values are the
 * only things that ship.
 */

export function getPostHogKey(): string | undefined {
  return process.env.EXPO_PUBLIC_POSTHOG_KEY;
}

export function getPostHogHost(): string {
  return process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
}
