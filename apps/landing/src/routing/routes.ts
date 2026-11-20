/**
 * Реєстр маршрутів сайту: шлях → файл сторінки в `src/pages/` (без `.tsx`).
 *
 * Лендінг лишається MPA-простим: без client-side router, кожен перехід –
 * повне завантаження, а сторінка обирається за pathname. Новий маршрут =
 * новий запис тут і в `routeMeta.json` (звірку тримає `routeRegistry.test.ts`);
 * він же потрапляє в `path` події `LANDING_VIEWED`, усе невідоме зводиться до
 * `/404`.
 *
 * Імена файлів, а не компоненти, тому що з одного реєстру живляться два
 * завантажувачі: клієнт тягне ЛИШЕ чанк поточної сторінки
 * (`loadPage.ts`, лінивий `import.meta.glob`), а SSG рендерить усі одразу
 * (`serverRoutes.ts`, eager). До 2026-11-20 клієнт імпортував усі 32 сторінки
 * статично, і кожна адреса вантажила текст решти тридцяти (аудит сайту
 * 2026-10-08, F3).
 */
export const ROUTE_PAGES = {
  "/": "HomePage",
  "/beta": "BetaPage",
  "/about": "AboutPage",
  "/data": "DataPage",
  "/hroshi": "HroshiPage",
  "/yizha": "YizhaPage",
  "/zvychky": "ZvychkyPage",
  "/trenuvannia": "TrenuvanniaPage",
  "/ruchna-robota": "RuchnaRobotaPage",
  "/vyhid": "VyhidPage",
  "/guides": "GuidesPage",
  "/zvyazky": "ZvyazkyPage",
  "/pomichnyk": "PomichnykPage",
  "/stan": "StanPage",
  "/obitsyanky": "ObitsyankyPage",
  "/pytannya": "PytannyaPage",
  "/contact": "ContactPage",
  "/guides/monobank": "GuideMonobankPage",
  "/guides/kbzhv": "GuideKbzhvPage",
  "/guides/cheky": "GuideChekyPage",
  "/guides/foto-kalorii": "GuideFotoKaloriiPage",
  "/guides/bank-bezpeka": "GuideBankBezpekaPage",
  "/guides/kilka-bankiv": "GuideKilkaBankivPage",
  "/guides/pryvat24": "GuidePryvat24Page",
  "/guides/silpo": "GuideSilpoPage",
  "/guides/pauza-i-propusk": "GuidePauzaPropuskPage",
  "/guides/ohlyad-dnya": "GuideOhlyadDnyaPage",
  "/guides/tyzhnevyi-pidsumok": "GuideTyzhnevyiPidsumokPage",
  "/guides/zamist-chotyryokh-trekeriv": "GuideZamistTrekerivPage",
  "/privacy": "PrivacyPage",
  "/terms": "TermsPage",
  // Свій маршрут, щоб prerender поклав у dist/404/index.html тіло цієї
  // сторінки, а не пререндерене тіло головної (soft-404 в індексі).
  "/404": "NotFoundPage",
} as const satisfies Record<string, string>;

export type RoutePath = keyof typeof ROUTE_PAGES;

export function isRoute(path: string): path is RoutePath {
  return Object.hasOwn(ROUTE_PAGES, path);
}

/** Маршрут, під яким сторінка рендериться: невідомий шлях стає `/404`. */
export function resolveRoute(path: string): RoutePath {
  return isRoute(path) ? path : "/404";
}

/** Поточний шлях без кінцевого слеша; корінь – `/`. */
export function currentPathname(): string {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}
