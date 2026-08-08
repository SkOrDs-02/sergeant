import { messages } from "@shared/i18n/uk";

/**
 * Single source of truth for Settings-section identity (id/title/keywords).
 *
 * L-13 audit finding (2026-08-08): `HubSettingsPage`'s own section list and
 * the ⌘K palette's `SETTINGS_INDEX` (`search/searchSettings.ts`) used to be
 * two hand-maintained arrays that drifted apart — the search index carried
 * two ids that don't exist as real sections ("general", "assistant") and
 * was missing four that do ("plan", "privacy", "feedback", "capabilities").
 * Both consumers now read the id/title/keywords triplet from here, so a
 * missing/renamed section fails loudly (typecheck + the parity test in
 * `search/searchSettings.test.ts`) instead of silently going unsearchable.
 *
 * What stays OUT of this file on purpose:
 *   - `render: () => <Section/>` closures — `HubSettingsPage` pairs each id
 *     with its own renderer locally. Importing component modules here would
 *     drag their render-time graph into the ⌘K search chunk, which loads on
 *     every hub session regardless of whether Settings is ever opened.
 *   - `icon`/`description` — presentation-only fields the search palette
 *     needs but the Settings page doesn't; kept local to `searchSettings.ts`
 *     since there's no cross-consumer drift risk for them.
 */
export interface SettingsSectionMeta {
  id: string;
  title: string;
  keywords: string;
}

export const SETTINGS_SECTIONS_CATALOG: readonly SettingsSectionMeta[] = [
  {
    id: "dashboard",
    title: "Дашборд",
    keywords:
      "дашборд dashboard підказки щільність density вигляд активні модулі порядок упорядкувати reorder hide inactive приховати",
  },
  {
    id: "plan",
    title: "Підписка та план",
    keywords:
      "план plan підписка subscription billing pro free trial trialing keruvaty stripe portal upgrade оплата",
  },
  {
    id: "notifications",
    title: "Нагадування",
    keywords: "сповіщення нагадування пуш push notifications reminders щоденні",
  },
  {
    id: "ai",
    title: "AI-дайджести",
    keywords:
      "ai штучний інтелект дайджест digest тижневий тренер coach insights",
  },
  {
    id: "capabilities",
    title: messages.onboarding.capabilitiesGroupTitle,
    // Audit finding #6 (2026-08-08): окрема секція «Загальні» злилась із
    // цією 2026-08-03 (див. коментар у тесті `search/searchSettings.test.ts`),
    // але її пошукові токени переїхали не повністю — «синхронізація»,
    // «акаунт», `sync`, `cloud`, `welcome`, «загальні» перестали матчити
    // будь-що в ⌘K. `scoreMatch` вимагає, щоб КОЖЕН токен запиту був
    // підрядком title+keywords, тож втрачений токен не просто знижує ранг —
    // він робить запит таким, що не знаходить нічого.
    keywords:
      "можливості асистент сержант команди chat help допомога інструменти каталог tools знайомство онбординг onboarding що вміє додаток розділи синхронізація акаунт sync cloud welcome загальні",
  },
  {
    id: "feedback",
    title: "Фідбек",
    keywords:
      "фідбек feedback відгук ідея баг bug пропозиція nps опитування survey підтримка",
  },
  {
    id: "routine",
    title: "Рутина",
    keywords: "звички рутина habits streak ціль reset",
  },
  {
    id: "fizruk",
    title: "Фізрук",
    keywords: "фізрук тренування кардіо вага workouts gym fitness",
  },
  {
    id: "finyk",
    title: "Фінік",
    keywords:
      "фінанси фінік finyk monobank privatbank token api transactions budget",
  },
  {
    id: "nutrition",
    title: "Їжа",
    // Дефект #6 (CodeRabbit post-merge review PR #756): `kбжу` — латинська
    // `k` + кирилиця `бжу` — не матчила НІ кирилічний запит «кбжу» (токен не
    // збігається байт-у-байт), НІ латинську транслітерацію (у токені все ще
    // кирилиця). Кирилична `кбжу` (для запиту рідною) і окрема `kbzhu`
    // (транслітерація) покривають обидва випадки.
    keywords:
      "харчування їжа nutrition meals food кбжу kbzhu калорії kcal білки жири вуглеводи вода комора pantry скан штрихкод barcode",
  },
  {
    id: "privacy",
    title: "Конфіденційність",
    keywords:
      "конфіденційність блокування pin пін lock security безпека захист",
  },
  {
    id: "pwa",
    title: "PWA та офлайн",
    keywords:
      "pwa офлайн offline service worker sw кеш cache діагностика скинути reset",
  },
  {
    id: "dataExport",
    title: "Експорт/імпорт JSON",
    keywords:
      "експорт імпорт export import json резервна копія backup hub дані data перенос",
  },
  {
    id: "experimental",
    title: "Експериментальні",
    keywords: "experimental lab beta debug розробка розробник developer",
  },
];
