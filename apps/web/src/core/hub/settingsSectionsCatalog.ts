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
    // V-7 audit finding (2026-08-08): title used to be "Нагадування" —
    // drifted from what the section itself renders ("Сповіщення",
    // NotificationsSection.tsx). The page copy wins (cheaper to fix the
    // search index than the visible product copy); "нагадування" already
    // lived in keywords, so nothing is lost by dropping it from the title.
    id: "notifications",
    title: "Сповіщення",
    keywords: "сповіщення нагадування пуш push notifications reminders щоденні",
  },
  {
    // V-7 audit finding (2026-08-08): title used to be "AI-дайджести" —
    // drifted from AIDigestSection.tsx's own "AI Звіт тижня". Page copy
    // wins. The old title's "дайджести" (plural) substring isn't covered
    // by the singular "дайджест" keyword below, so it moves into keywords
    // explicitly instead of silently stopping to match.
    id: "ai",
    title: "AI Звіт тижня",
    keywords:
      "ai штучний інтелект дайджест дайджести digest тижневий тренер coach insights",
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
    // V-7 audit finding (2026-08-08): title used to be "Експериментальні" —
    // drifted from ExperimentalSection.tsx's own "Додаткові можливості",
    // and THAT page copy almost duplicated the neighbouring "capabilities"
    // section's "Можливості" (two settings entries the user couldn't tell
    // apart by name). Here the page copy does NOT win: "Додаткові
    // можливості" is the thing being replaced, not the target. New value
    // "Експериментальні функції" — КОПІЯ ДЛЯ ЗАТВЕРДЖЕННЯ ВЛАСНИКОМ, see
    // `messages.experimentalSection.title` in `uk.ts`/`en.ts` for the
    // matching page-copy change.
    id: "experimental",
    title: "Експериментальні функції",
    keywords: "experimental lab beta debug розробка розробник developer",
  },
];

/**
 * V-7 audit finding (2026-08-08): this catalog's `title` feeds the ⌘K
 * palette, but three sections drew their own `<SettingsGroup title="…">`
 * from a hardcoded string instead of this catalog — nothing compared the
 * two, so "Нагадування" (⌘K) vs "Сповіщення" (page), "AI-дайджести" vs
 * "AI Звіт тижня", and "Експериментальні" vs "Додаткові можливості" drifted
 * apart silently. `settingsSectionTitle(id)` is the single lookup a section
 * should call instead of re-typing the string — an unknown id throws
 * immediately (at render time, not a silently blank header) so a
 * renamed/removed catalog entry is caught the moment a section reads it.
 */
/**
 * The sections every consumer that *lists* them reads: the Settings page, the
 * ⌘K palette, the valid-tab-id set in `hubNav`.
 *
 * Currently identical to the raw catalog. The indirection stays because it is
 * the single place to hide a section from all three listings at once, which is
 * the whole point of having one catalog.
 */
export const VISIBLE_SETTINGS_SECTIONS: readonly SettingsSectionMeta[] =
  SETTINGS_SECTIONS_CATALOG;

export function settingsSectionTitle(id: string): string {
  const section = SETTINGS_SECTIONS_CATALOG.find((s) => s.id === id);
  if (!section) {
    throw new Error(
      `settingsSectionTitle: unknown Settings section id "${id}" — ` +
        `add it to SETTINGS_SECTIONS_CATALOG first (V-7, 2026-08-08).`,
    );
  }
  return section.title;
}
