import type { User } from "@sergeant/shared";
import { getVibePicks, type HubModuleId } from "../onboarding/vibePicks";

/**
 * Person properties (traits), які прокидаються в PostHog `identify(distinctId, traits)`
 * з `AuthContext` після переходу у `authenticated`. Усі поля опціональні —
 * якщо джерело недоступне (наприклад, `localStorage` у Capacitor у
 * cold-start, або `navigator.language` у не-DOM-середовищі), трейт
 * просто не потрапляє у payload, замість того щоб ламати identify.
 *
 * Контракт навмисно вузький:
 *   - `vibe` — масив id вкладок ("finyk", "fizruk", …) з онбордингу.
 *     Сегментуємо ретеншн і funnel-и за тим, який модуль користувач
 *     обрав на старті. Якщо vibe-picks порожні — поле опускаємо.
 *   - `plan` — поточний tier підписки. Поки що Stripe/billing немає
 *     (див. `docs/launch/01-monetization-and-pricing.md`), тому всі
 *     ідентифіковані юзери `"free"`. Коли підписки з'являться, цей
 *     модуль буде єдине місце, де треба підставити реальне джерело.
 *   - `locale` — `navigator.language` без подальшої нормалізації,
 *     обрізаний до 16 символів (узгоджено з `Locale` schema в
 *     `packages/shared/src/schemas/api.ts`).
 *   - `signup_date` — `YYYY-MM-DD` у UTC з `user.createdAt`. Дата без
 *     часу свідома: дозволяє "за днем життя акаунта" сегментацію без
 *     зайвого PII (точна година реєстрації нікому не потрібна для
 *     funnels).
 */
export interface IdentifyTraits {
  vibe?: HubModuleId[];
  plan?: "free" | "pro";
  locale?: string;
  signup_date?: string;
}

const MAX_LOCALE_LENGTH = 16;

function safeNavigatorLanguage(): string | null {
  try {
    if (typeof navigator === "undefined") return null;
    const lang = navigator.language;
    if (typeof lang !== "string") return null;
    const trimmed = lang.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, MAX_LOCALE_LENGTH);
  } catch {
    return null;
  }
}

function safeVibePicks(): HubModuleId[] {
  try {
    return getVibePicks();
  } catch {
    return [];
  }
}

/**
 * Перетворює ISO-рядок з `user.createdAt` у `YYYY-MM-DD` (UTC). Будь-яке
 * не-ISO значення → `null` (а не throw): identify навмисно толерантний
 * до зіпсованих legacy-юзерів.
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

/**
 * Поточний підписковий tier. До реальних підписок завжди `"free"` —
 * див. JSDoc `IdentifyTraits.plan`.
 */
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

  const locale = safeNavigatorLanguage();
  if (locale) traits.locale = locale;

  const signupDate = toSignupDate(user.createdAt);
  if (signupDate) traits.signup_date = signupDate;

  return traits;
}
