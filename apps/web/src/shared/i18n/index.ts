/**
 * i18n entry-point — locale resolver + canonical exports.
 *
 * Initiative 0010 EN-locale foundation. `uk.ts` стає baseline (всі 76
 * existing consumers продовжують `import { messages } from "@shared/i18n/uk"`
 * без змін). Нові surfaces, які хочуть lang-switching, імпортують
 * `getMessages(lang)` звідси.
 *
 * Merge contract: shallow per top-level group. Якщо `en.ts` має
 * `paywall: {...}` — він повністю замінює `uk.paywall`. Якщо `en.ts` не
 * має, скажімо, `auth: {...}` — EN-resolver повертає UK `auth` без змін.
 * Це навмисно: змушує "translate the whole group or don't touch it"
 * дисципліну, не залишаючи half-translated keys у виходному JSX-і.
 *
 * Чому НЕ deep merge: deep-merge може створити Frankenstein-object
 * (`paywall.title` EN + `paywall.description` UK), що буде гірше за чисту
 * UA-mode для всього group. Shallow merge — explicit choice між languages
 * на рівні surface-area.
 *
 * Type-safety: `getMessages()` повертає тип `MessageCatalog`, той самий що
 * `messages` (uk-default). Consumers не платять type cost за multi-locale —
 * autocompletion і narrowing працюють як зараз.
 */

import { messages as uk, type MessageCatalog } from "./uk";
import { messagesEn } from "./en";

export type Locale = "uk" | "en";
export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ["uk", "en"];
export const DEFAULT_LOCALE: Locale = "uk";

/**
 * Re-export uk default `messages` так само як раніше. Existing 76
 * consumers продовжують працювати без змін.
 */
export { messages, type MessageCatalog } from "./uk";

/**
 * Re-export en partial для прямого read у тестах/dev-tools.
 */
export { messagesEn } from "./en";

/**
 * Resolve full message catalog for a given locale.
 *
 * - `lang='uk'` (default): returns canonical `uk` без копіювання.
 * - `lang='en'`: shallow merges `messagesEn` поверх `uk`. Top-level groups
 *   that EN translates entirely replace their UK twin; absent groups fall
 *   through.
 *
 * Returned object is **frozen** to prevent accidental mutation by
 * downstream code (caching pattern matches `Object.freeze(ANALYTICS_EVENTS)`
 * у `packages/shared/src/lib/analyticsEvents.ts`).
 */
export function getMessages(lang: Locale): MessageCatalog {
  if (lang === "uk") return uk;
  // Shallow merge: each top-level key in `messagesEn` fully replaces UK.
  // Missing keys (most of the catalog right now) inherit from UK.
  return Object.freeze({ ...uk, ...messagesEn }) as MessageCatalog;
}

/**
 * Parse a free-form locale string to a supported `Locale`. Used by query-
 * param / localStorage reading. Returns `DEFAULT_LOCALE` for invalid input
 * — never throws.
 *
 * Recognizes:
 * - exact `"uk"` / `"en"` (case-insensitive)
 * - common BCP-47 prefixes: `en-US`, `en-GB`, `uk-UA`
 * - everything else → `DEFAULT_LOCALE`
 */
export function parseLocale(raw: string | null | undefined): Locale {
  if (!raw) return DEFAULT_LOCALE;
  const normalized = raw.toLowerCase().split("-")[0];
  if (normalized === "en") return "en";
  if (normalized === "uk") return "uk";
  return DEFAULT_LOCALE;
}
