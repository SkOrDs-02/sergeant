/**
 * In-product «What's new» release feed.
 *
 * `RELEASES` — single source of truth для `<WhatsNewModal />`. Markdown
 * у `docs/whats-new/<id>.md` живе паралельно як human-readable changelog;
 * drift з цим файлом ловиться у `releases.test.ts`.
 *
 * Sorting rule: **newest first**. Modal показує `RELEASES[0]` як «latest»
 * і пропускає його, якщо `lastSeenId === RELEASES[0].id`. Старіші записи
 * не повторно показуються — це not-a-changelog-modal, це one-shot
 * «що нового з минулого візиту».
 *
 * Edit guard: НЕ міняй `id`, `title`, `items[]` старих записів. Користувачі
 * вже отримали PostHog event з попереднім payload-ом — drift створює
 * розщеплені funnels у `whats_new_shown` / `whats_new_cta_clicked`.
 * Замість цього додай новий запис.
 *
 * Виняток (UX-feedback 2026-05-08): копія `2026-05-06-cold-start` була
 * переписана in-place. Причина — оригінальний текст ("outcome card",
 * "FTUX-копія", "`pnpm bootstrap`", "drift-check у CI") був інженерним
 * жаргоном, а не release-нотами для юзера. Це bugfix копії, не нова фіча,
 * і id навмисно лишається той самий — щоб не тригерити повторний modal
 * для всіх, хто вже закрив попередню версію, та зберегти аналітичні
 * events на тому ж slug. Funnel-drift тут мінімальний (тільки текст,
 * без зміни кількості/типу items). Майбутні зміни — додавати новий
 * запис, як писано вище.
 *
 * See `docs/whats-new/README.md` для шаблону + how-to.
 */

export type WhatsNewItemKind = "feature" | "fix" | "improvement";

export interface WhatsNewItem {
  /** Тип позначки — рендериться як кольоровий префікс у списку. */
  kind: WhatsNewItemKind;
  /** UA-копія, ≤ ~120 символів. Має співпадати з markdown-версією. */
  text: string;
}

export interface WhatsNewCta {
  /** Текст кнопки CTA, не довше 24 символів. */
  label: string;
  /**
   * Куди веде CTA — внутрішній path (`/`, `/onboarding/replay`) АБО external
   * `https://...` URL. Internal-link клік навігує через `react-router`,
   * external — `window.open(href, "_blank", "noopener noreferrer")`.
   */
  href: string;
}

export interface WhatsNewRelease {
  /** ISO-date-prefixed slug — має співпадати з `docs/whats-new/<id>.md`. */
  id: string;
  /** ISO-8601 (`YYYY-MM-DD`) — date, коли реліз пішов у production. */
  date: string;
  /** Заголовок modal — UA, ≤ 60 символів. */
  title: string;
  /** Один абзац — рендериться під заголовком. */
  summary: string;
  /** Items — bullet-list у тілі modal. 3-6 точок оптимально. */
  items: readonly WhatsNewItem[];
  /** Optional CTA — якщо немає, показуємо тільки «Зрозуміло». */
  cta?: WhatsNewCta;
}

export const RELEASES: readonly WhatsNewRelease[] = [
  {
    id: "2026-05-06-cold-start",
    date: "2026-05-06",
    title: "Перший екран більше не порожній",
    summary:
      "Після знайомства ти одразу бачиш картку з конкретним першим кроком, а не пустий екран. Текст вступу теж став зрозумілішим — про те, що ти отримаєш, а не перелік функцій.",
    items: [
      {
        kind: "feature",
        text: "На головному з'являється картка з першим кроком — клік, і ти вже у потрібному розділі.",
      },
      {
        kind: "improvement",
        text: "Текст на стартовому екрані переписали — тепер він говорить про результат, а не перелічує функції.",
      },
      {
        kind: "fix",
        text: "Анімацію з конфетті прибрали з кінця знайомства — вона з'являється тільки після того, як ти зробиш перший запис.",
      },
    ],
  },
];

/**
 * Повертає найсвіжіший реліз, якого юзер ще не бачив, або `null` якщо все
 * проглянуто (АБО список пустий). `lastSeenId === null` (новий девайс) —
 * показуємо `RELEASES[0]`. Це навмисно: для свіжо-зареєстрованого юзера
 * "що нового" — фактично "ось що ми нещодавно зробили", і спрощений CTA
 * на доку є валідним FTUX-сурфейсом.
 */
export function pickRelease(lastSeenId: string | null): WhatsNewRelease | null {
  if (RELEASES.length === 0) return null;
  const latest = RELEASES[0];
  if (!latest) return null;
  if (lastSeenId === latest.id) return null;
  return latest;
}
