/**
 * Базова лінія перед віссю дії хабу (P3, `anti-slop-strategy.md`).
 *
 * Рішення власника 2026-08-07: головна переходить на «вісь дії» (варіант
 * A1 «дві купи»), але перехід НЕ починається, доки не зібрано базової
 * лінії на ПОТОЧНОМУ хабі — «інакше A1 порівнюватиметься з порожнечею».
 * Порядок названо непереговорним: спершу три події, потім тижні зо два
 * заміру, і лише тоді вітка за прапорцем.
 *
 * Це ті три події. До них у всій теці `core/hub/dashboard/` був рівно
 * ОДИН `trackEvent`, і той про стрік: клік по плитці не трекався, відкриття
 * модуля як продуктова подія — теж, CTA в «Зараз» — теж.
 *
 * Живе окремим модулем від `analyticsEvents.ts` заради module-size-
 * дисципліни (Hard Rule #18) — реєстр лишається один: група спредиться в
 * `ANALYTICS_EVENTS`, тож публічний доступ `ANALYTICS_EVENTS.MODULE_OPENED`
 * не змінюється. Тут тільки рядкові константи, їхні контракти в
 * коментарях і тип джерела.
 *
 * Last validated: 2026-09-17
 * Status: Active
 */

/**
 * Звідки саме людина відкрила модуль. Це і є питання базової лінії:
 * «як входять у модуль — через плитку чи через дію?». Модуль їде
 * property-полем, а не в імені події (конвенція `cross_module_preview_*`).
 *
 * `hub_dashboard` — прямий проп `onOpenModule` з головної (плитка,
 * secondary-лінк hero, картка результату у FTUX). Сама плитка при цьому
 * ЩЕ й шле `HUB_MODULE_TILE_CLICKED`, тож частку плитки всередині
 * `hub_dashboard` видно окремо.
 *
 * `other` — виклик через шину `hub:open-module` без названого джерела
 * (крос-модульні посилання всередині модулів, FTUX-пресети тощо).
 * Не «unknown»: подія відома, просто джерело не варте окремого значення.
 */
export const MODULE_OPEN_SOURCES = [
  "hub_dashboard",
  "module_switcher",
  "today_focus_cta",
  "tile_peek",
  "search",
  "pwa_shortcut",
  // Вісь дії (спека `hub-action-axis.md`, PR 2): рейок «Модулі» на хабі —
  // той самий компонент, що й `module_switcher` у модулях, але інше місце,
  // тож і джерело інше: саме частка `module_rail` відповідає, чи знаходять
  // люди модулі без сітки плиток.
  "module_rail",
  // Рядок купи «Зараз» нижче за hero (hero лишається `today_focus_cta`).
  "now_pile",
  "other",
] as const;

export type ModuleOpenSource = (typeof MODULE_OPEN_SOURCES)[number];

export const HUB_AXIS_ANALYTICS_EVENTS = Object.freeze({
  // ── Клік по плитці модуля на головній ────────────────────────────
  //
  //   HUB_MODULE_TILE_CLICKED { module: DashboardModuleId,
  //                             inactive: boolean }   // неактивна плитка
  //                                                    // веде в Налаштування,
  //                                                    // а не в модуль
  //
  // Це «двері», які плитка виконує одночасно з роботою «число». Саме ця
  // подія відповідає, скільки входів у модуль втратить головна без сітки.
  HUB_MODULE_TILE_CLICKED: "hub_module_tile_clicked",

  // ── Модуль відкрито (продуктова подія, ЄДИНА точка) ─────────────
  //
  //   MODULE_OPENED { module: DashboardModuleId,
  //                   source: ModuleOpenSource }
  //
  // Стріляє в `useHubNavigation.openModule` — крізь неї проходять усі
  // шляхи: проп із головної, шина `hub:open-module`, PWA-shortcut із
  // сервіс-воркера. Тому подія одна, а не по одній на кожен вхід.
  MODULE_OPENED: "module_opened",

  // ── Клік по CTA картки «Зараз» (TodayFocusCard) ──────────────────
  //
  //   TODAY_FOCUS_CTA_CLICKED { rec_id: string,        // напр. "fizruk_long_break"
  //                             module: RecModule,
  //                             kind: "primary" | "secondary",
  //                             has_pwa_action: boolean }
  //
  // `rec_id` — стабільний id рекомендації з `recommendationEngine`;
  // параметричні (`routine_streak_<n>`, `weekly_digest_<date>`) несуть
  // суфікс як є — це не PII, а ключ дедупу. `primary` виконує дію інлайн
  // (`pwaAction`) або відкриває модуль; `secondary` — завжди «Відкрити
  // <модуль>» без дії.
  TODAY_FOCUS_CTA_CLICKED: "today_focus_cta_clicked",
} as const);
