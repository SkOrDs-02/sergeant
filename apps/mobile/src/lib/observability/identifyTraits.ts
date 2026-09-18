/**
 * PostHog person traits for the Expo app — mobile counterpart of
 * `apps/web/src/core/observability/identifyTraits.ts`.
 *
 * Контракт навмисно вузький — той самий набір полів, що web:
 *   - `vibe` — масив id вкладок з онбордингу (читаємо з MMKV через
 *     `mobileKVStore`). Якщо порожній — поле опускаємо, щоб не
 *     перетирати раніше встановлений person property у PostHog.
 *   - `plan` — поточний tier підписки. До запуску білінгу — `"free"`.
 *   - `locale` — поки немає mobile-equivalent для `navigator.language`,
 *     поле опускаємо. Web заповнює його сам, тож для користувача,
 *     який спершу зайшов з браузера, а потім з Expo, locale збережеться.
 *   - `signup_date` — `YYYY-MM-DD` у UTC з `user.createdAt`.
 */

import {
  getVibePicks,
  type DashboardModuleId,
  type User,
} from "@sergeant/shared";

import { mobileKVStore } from "@/lib/storage";

export interface IdentifyTraits {
  vibe?: DashboardModuleId[];
  plan?: "free" | "pro";
  signup_date?: string;
}

function safeVibePicks(): DashboardModuleId[] {
  try {
    return getVibePicks(mobileKVStore);
  } catch {
    return [];
  }
}

/**
 * Перетворює ISO-рядок з `user.createdAt` у `YYYY-MM-DD` (UTC).
 * Будь-яке не-ISO значення → `null` (а не throw): identify навмисно
 * толерантний до зіпсованих legacy-юзерів.
 */
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
 * Будує traits-обʼєкт для PostHog `identify`. Опускає поля, у яких
 * джерело недоступне, щоб не перетирати раніше встановлені person
 * properties у PostHog порожнім значенням.
 */
export function buildIdentifyTraits(user: User): IdentifyTraits {
  const traits: IdentifyTraits = { plan: currentPlan() };

  const vibe = safeVibePicks();
  if (vibe.length > 0) traits.vibe = vibe;

  const signupDate = toSignupDate(user.createdAt);
  if (signupDate) traits.signup_date = signupDate;

  return traits;
}
