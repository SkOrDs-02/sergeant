import type { User } from "@sergeant/shared";
import { getVibePicks, type DashboardModuleId } from "@sergeant/shared";

import { mobileKVStore } from "@/lib/storage";

/**
 * Person properties (traits) for PostHog `identify(distinctId, traits)`,
 * mirror of `apps/web/src/core/observability/identifyTraits.ts`. The
 * mobile build reads `vibe` from the same shared MMKV-backed store the
 * onboarding wizard writes to (`mobileKVStore`), so web and mobile
 * funnels segment on identical taxonomy.
 *
 *   - `vibe` — array of `DashboardModuleId`s from onboarding picks. If
 *     vibe-picks are empty (e.g. the user hasn't finished the wizard
 *     on this device yet), the field is omitted rather than sent as
 *     `[]` — that prevents an existing PostHog person profile from
 *     being clobbered when a returning user re-installs the app.
 *   - `plan` — current subscription tier. Stripe / billing isn't wired
 *     yet (see `docs/launch/01-monetization-and-pricing.md`), so all
 *     identified users are `"free"`. When subscriptions land, this is
 *     the single place where the real source plugs in.
 *   - `locale` — best-effort device language string capped at 16 chars.
 *     Falls back to `undefined` when no locale source is available
 *     (cold-start before any RN module exposes locale, jest-expo
 *     environment, …) so the field is opt-in instead of polluting the
 *     person profile with `"en-US"` on every device.
 *   - `signup_date` — `YYYY-MM-DD` (UTC) extracted from `user.createdAt`.
 *     Day granularity matches the web trait — enough for "day-of-life"
 *     segmentation without leaking precise registration time as PII.
 */
export interface IdentifyTraits {
  vibe?: DashboardModuleId[];
  plan?: "free" | "pro";
  locale?: string;
  signup_date?: string;
}

const MAX_LOCALE_LENGTH = 16;

function safeVibePicks(): DashboardModuleId[] {
  try {
    return getVibePicks(mobileKVStore);
  } catch {
    return [];
  }
}

interface IntlLike {
  DateTimeFormat?: () => { resolvedOptions: () => { locale?: string } };
}

function getIntl(): IntlLike | undefined {
  // The mobile bundle does not depend on `expo-localization` (intl-api
  // surface unused so far), so we sniff the Intl global if present —
  // available on Hermes 0.74+ which RN 0.76 ships. Single cast to a
  // narrow shape on the well-known global avoids the
  // `as unknown as` double-cast guard.
  const g = globalThis as { Intl?: IntlLike };
  return g.Intl;
}

function safeDeviceLocale(): string | null {
  try {
    const intl = getIntl();
    const resolved = intl?.DateTimeFormat?.().resolvedOptions().locale;
    if (typeof resolved !== "string") return null;
    const trimmed = resolved.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, MAX_LOCALE_LENGTH);
  } catch {
    return null;
  }
}

function toSignupDate(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentPlan(): "free" | "pro" {
  return "free";
}

/**
 * Build the traits object passed to `identifyPostHogUser`. Drops
 * fields with no available source so a fresh device install does not
 * overwrite an existing PostHog person profile with an empty value.
 */
export function buildIdentifyTraits(user: User): IdentifyTraits {
  const traits: IdentifyTraits = { plan: currentPlan() };

  const vibe = safeVibePicks();
  if (vibe.length > 0) traits.vibe = vibe;

  const locale = safeDeviceLocale();
  if (locale) traits.locale = locale;

  const signupDate = toSignupDate(user.createdAt);
  if (signupDate) traits.signup_date = signupDate;

  return traits;
}
