import { useAuth } from "../auth/AuthContext";

/**
 * Reverse-trial day-7 paywall A/B feature flag (growth-experiment G_next-1,
 * CMP-70 / Eng-wiring CMP-72).
 *
 * Sticky per user: варіант обчислюється детерміновано з `user.id` (Better Auth
 * opaque string) через FNV-1a 32-bit hash → однаковий на всіх пристроях/сесіях
 * одного юзера. Без PostHog feature-flag бекенду — web-PR лишається
 * self-contained (Hard-залежність лише від `user.id`, який вже тягнеться через
 * `useAuth()`). Коли (якщо) з'явиться PostHog `$feature/flag` інтеграція —
 * resolver можна підмінити, не чіпаючи call-sites, бо контракт `("A"|"B")`
 * стабільний.
 *
 * Контракт:
 *   - `user.id` відсутній (demo / unauthenticated / 401) → `"A"` (control).
 *     Не контамінуємо експеримент анонімними сесіями.
 *   - Split ~50/50 (див. `featureFlags.test.ts` — на 1 000 послідовних id
 *     обидва варіанти трапляються в [40 %, 60 %]).
 *
 * PostHog атрибуція: `variant` прокидається у `paywall_viewed.variant` через
 * `PaywallModal` (див. `PaywallModal.tsx` trackEvent-гілку).
 */

export const PAYWALL_TRIAL_DAY7_COPY_FLAG = "paywall_trial_day7_copy";

export type PaywallTrialDay7Variant = "A" | "B";

/**
 * Детермінований FNV-1a 32-bit hash → варіант A/B. Sticky per `seed`.
 *
 * FNV-1a обраний бо: (1) тривіальний і fast, без dep-ів; (2) добре
 * розподіляє короткі строкові id (Better Auth id ≈ 24-30 символів); (3)
 * стабільний на всіх платформах (цілочисельна арифметика через `Math.imul`
 * — без BigInt, без переповнень JS-ного `Number`).
 *
 * @param seed — стабільний per-user ідентифікатор (напр. `user.id`).
 * @returns `"A"` (control) або `"B"` (treatment).
 */
export function resolvePaywallTrialDay7Copy(
  seed: string,
): PaywallTrialDay7Variant {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // `>>> 0` — нормалізує signed 32-bit у unsigned, щоб `% 2` не залежав
  // від знакового біта. Control `A` на парному хеші, treatment `B` на непарному.
  return (h >>> 0) % 2 === 0 ? "A" : "B";
}

/**
 * React-hook обгортка над {@link resolvePaywallTrialDay7Copy}: тягне
 * `useAuth().user.id` і повертає sticky-варіант. Для неавтентифікованих /
 * demo-сесій (де `user === null`) падає на control `"A"`, щоб анонімні
 * покази не забруднювали A/B-метрику.
 *
 * Використовується лише всередині `TrialDay7Paywall` (єдиний A/B-surface
 * наразі). Не викликай у рендері, де немає `AuthProvider` — `useAuth()`
 * кине.
 */
export function useTrialDay7Variant(): PaywallTrialDay7Variant {
  const { user } = useAuth();
  if (!user?.id) return "A";
  return resolvePaywallTrialDay7Copy(user.id);
}
