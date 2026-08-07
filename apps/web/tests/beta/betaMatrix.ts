/**
 * Канон прийомного браузерного прогону бети (`e2e:beta`).
 *
 * Дизайн і rationale — `docs/90-work/beta-launch/beta-browser-run.md`;
 * цей файл — його машинна половина: матриця живе кодом, щоб дизайн і
 * прогін не розʼїжджались (той самий контракт, що в
 * `tests/profiles/profileMatrix.ts`).
 *
 * Відмінність від профільного лейна: персони тут — стани, через які
 * пройде реальний бета-тестер із Telegram-вейтліста (анонім із групи →
 * signup → видача Pro скриптом → другий пристрій → тиждень даних), і
 * прогін розрахований на живе бета-середовище з реальними AI-ключами.
 * Кроки поділені на `automation: "auto" | "manual"` — auto виконує
 * Playwright-спека, manual — людина за чеклістом дизайн-дока: якість
 * поради чи влучність аналізу фото асертом не формалізуються.
 */

export type BetaAccountState = "anonymous" | "fresh" | "returning";
/**
 * `beta-pro` — НЕ довільний Pro: рядок `subscriptions` зі
 * `status = 'trialing', provider = 'manual'`, створений
 * `scripts/billing/grant-beta-pro.mjs` — рівно той стан, який матиме
 * кожен тестер. UI, що чекає лише `status = 'active'`, зламає всіх.
 */
export type BetaPlanState = "free" | "beta-pro";
export type BetaDataState = "empty" | "single-run" | "week-backdated";

export interface BetaPersona {
  /** Стабільний ідентифікатор — імена тестів, скріншоти, email-префікси. */
  id: string;
  /** Людський опис — кого з живої бети моделює персона. */
  title: string;
  account: BetaAccountState;
  plan: BetaPlanState;
  data: BetaDataState;
  /** Питання, на яке відповідає саме ця персона і жодна інша. */
  question: string;
}

export const BETA_PERSONAS: readonly BetaPersona[] = [
  {
    id: "BT1-anon-group",
    title: "Анонім із Telegram-групи",
    account: "anonymous",
    plan: "free",
    data: "empty",
    question:
      "Людина відкрила лінк бети без реєстрації: чи все працює і чи анонімна AI-квота завершується підказкою увійти, а не глухим кутом?",
  },
  {
    id: "BT2-fresh-nopro",
    title: "Щойно зареєстрований, ще без Pro",
    account: "fresh",
    plan: "free",
    data: "single-run",
    question:
      "Вікно між signup і видачею Pro, яке пройде кожен тестер: що видно, що загейчено і чи зрозуміло, що буде далі?",
  },
  {
    id: "BT3-beta-pro",
    title: "Канонічний бета-тестер (Pro trialing)",
    account: "fresh",
    plan: "beta-pro",
    data: "single-run",
    question:
      "Чи знімає status='trialing', provider='manual' усі Pro-гейти — фото їжі, PDF, AI-memory — і чи не продаємо платнику підписку вдруге?",
  },
  {
    id: "BT4-second-device",
    title: "Той самий тестер на другому пристрої",
    account: "returning",
    plan: "beta-pro",
    data: "single-run",
    question:
      "Чи повертаються дані, налаштування і активні модулі на чистому пристрої (порожні localStorage/SQLite)?",
  },
  {
    id: "BT5-active-week",
    title: "Активний тиждень (насіяні 7+ днів)",
    account: "fresh",
    plan: "beta-pro",
    data: "week-backdated",
    question:
      "Чи зʼявляються звʼязки, кореляції дайджесту й поради, коли даних справді достатньо (MIN_N=5 спільних днів, |r|≥0.4)?",
  },
] as const;

/**
 * Скільки живих AI-повідомлень прогін має право спалити СУМАРНО по всіх
 * персонах. Кожне повідомлення — реальні токени під денними бюджетними
 * порогами бети ($3 soft / $5 hard, див. run-beta-wave.md §0.1); лейн
 * рахує і зупиняється, а не «скільки вийде».
 */
export const MAX_LIVE_AI_MESSAGES_PER_RUN = 12;

export type BetaJourneyLane = "sanity" | "base" | "ai" | "lifecycle";
export type BetaAutomation = "auto" | "manual";

export interface BetaJourneyStep {
  id: string;
  /** Маршрут, з якого починається крок (для manual — де дивитись). */
  route: string;
  /** Що робимо і що саме перевіряємо. */
  intent: string;
  lane: BetaJourneyLane;
  automation: BetaAutomation;
}

/**
 * Порядок циклів навмисний: санітарний → базовий → AI → життєвий цикл.
 * Якщо середовище зібране не так (не той SHA, зламаний проксі),
 * персонні прогони лише зашумлять картину — тому sanity йде першим.
 */
export const BETA_JOURNEY: readonly BetaJourneyStep[] = [
  // ---- Цикл 3 у дизайн-доці: середовище бети (санітарний) ----
  {
    id: "sanity-proxy",
    route: "/",
    intent:
      "Усі запити застосунку йдуть same-origin через edge-проксі (BACKEND_URL), без CORS на api-хост",
    lane: "sanity",
    automation: "auto",
  },
  {
    id: "sanity-boot",
    route: "/",
    intent:
      "Кілька hard reload поспіль — #root не лишається порожнім (регресія B1: гонка SW з бутом)",
    lane: "sanity",
    automation: "auto",
  },
  {
    id: "sanity-build-id",
    route: "/health",
    intent:
      "X-Server-Build-Id бекенда збігається з очікуваним SHA (curl, див. run-beta-wave.md §3.1 крок 4)",
    lane: "sanity",
    automation: "manual",
  },
  {
    id: "sanity-legal",
    route: "/pricing",
    intent: "Оферта і приватність відкриваються з /pricing і футера",
    lane: "sanity",
    automation: "auto",
  },
  {
    id: "sanity-pwa",
    route: "/",
    intent:
      "PWA ставиться на мобільному, оболонка стартує офлайн, банер оновлення приходить після нового деплою",
    lane: "sanity",
    automation: "manual",
  },
  {
    id: "sanity-telemetry",
    route: "/",
    intent:
      "Події signup/paywall видно в PostHog проєкту бети; тестова помилка — у Sentry з environment=beta",
    lane: "sanity",
    automation: "manual",
  },

  // ---- Цикл 1: базові дії та збереження ----
  {
    id: "hub",
    route: "/",
    intent:
      "Хаб: модулі активні (не «0 з 4» — регресія B2), є вхід у перший крок",
    lane: "base",
    automation: "auto",
  },
  {
    id: "finyk-expense",
    route: "/finyk/transactions",
    intent:
      "Додати витрату і побачити її у списку (день нового запису розгорнутий — B6)",
    lane: "base",
    automation: "auto",
  },
  {
    id: "finyk-analytics",
    route: "/finyk/analytics",
    intent: "Аналітика рендериться зі створеними записами",
    lane: "base",
    automation: "auto",
  },
  {
    id: "routine-habit",
    route: "/routine/habits",
    intent: "Створити звичку і відмітити її на сьогодні",
    lane: "base",
    automation: "auto",
  },
  {
    id: "nutrition-pantry",
    route: "/nutrition/pantry",
    intent: "Додати продукт у комору (регістр назви збережено — B7)",
    lane: "base",
    automation: "auto",
  },
  {
    id: "fizruk",
    route: "/fizruk",
    intent: "Огляд тренувань: порожній стан або дані, без падінь",
    lane: "base",
    automation: "auto",
  },
  {
    id: "persistence-reload",
    route: "/routine/habits",
    intent: "Перезавантаження сторінки — створене нікуди не зникло",
    lane: "base",
    automation: "auto",
  },
  {
    id: "persistence-second-device",
    route: "/",
    intent:
      "BT4: вхід на чистому контексті повертає дані, налаштування і активні модулі з сервера",
    lane: "base",
    automation: "auto",
  },
  {
    id: "pricing-plan",
    route: "/pricing",
    intent:
      "Тариф позначено чесно: free бачить свій план, beta-pro бачить «Зараз ваш план» + «Керувати підпискою» (B5)",
    lane: "base",
    automation: "auto",
  },

  // ---- Цикл 2: AI-шар — Сержант, поради, звʼязки, інсайти ----
  {
    id: "sergeant-reply",
    route: "/chat",
    intent:
      "Живий промпт Сержанту → 200 і відповідь відрендерилась (патерн hub-chat-live-smoke)",
    lane: "ai",
    automation: "auto",
  },
  {
    id: "sergeant-anon-quota",
    route: "/chat",
    intent:
      "BT1: вичерпання AI_DAILY_ANON_LIMIT дає підказку увійти (AI_QUOTA_ANON), не глухий кут; перевіряємо поведінку, не число",
    lane: "ai",
    automation: "auto",
  },
  {
    id: "sergeant-free-quota",
    route: "/chat",
    intent:
      "BT2: лічильник повідомлень видимий і чесний; вичерпання веде до зрозумілої пропозиції",
    lane: "ai",
    automation: "manual",
  },
  {
    id: "sergeant-memory",
    route: "/chat",
    intent:
      "Сказати Сержанту факт → перезайти → спитати: памʼятає (AI-memory, Pro); факт видно і видаляється в Налаштування → Приватність",
    lane: "ai",
    automation: "manual",
  },
  {
    id: "insights-links",
    route: "/insights",
    intent:
      "BT5: ≥1 крос-модульний звʼязок зі ступенем впевненості, формулювання чесне щодо |r|; BT2–BT4: секція мовчить, не падає",
    lane: "ai",
    automation: "auto",
  },
  {
    id: "insights-advice",
    route: "/insights",
    intent:
      "BT5: порада стосується реальних даних тижня; BT2: чесний порожній стан без обіцянок",
    lane: "ai",
    automation: "manual",
  },
  {
    id: "insights-digest",
    route: "/insights",
    intent:
      "BT5: тижневий дайджест із кореляціями; цифри збігаються з даними модулів (metric parity)",
    lane: "ai",
    automation: "manual",
  },
  {
    id: "nutrition-photo",
    route: "/nutrition/log",
    intent:
      "Pro: фото їжі → продукти і КБЖВ у межах здорового глузду; free: paywall, не помилка",
    lane: "ai",
    automation: "manual",
  },
  {
    id: "insights-pdf",
    route: "/insights",
    intent:
      "PDF-експорт: beta-pro без paywall (auto), файл відкривається і містить дані (manual); free — paywall",
    lane: "ai",
    automation: "auto",
  },
  {
    id: "ai-tone",
    route: "/chat",
    intent:
      "Тон і мова всіх AI-поверхонь: українська, «ти»-звертання, без сирих JSON/markdown-артефактів",
    lane: "ai",
    automation: "manual",
  },

  // ---- Цикл 4: життєвий цикл акаунта (BT2 наприкінці прогону) ----
  {
    id: "lifecycle-export",
    route: "/settings",
    intent: "Експорт даних: файл приходить і містить створені записи",
    lane: "lifecycle",
    automation: "manual",
  },
  {
    id: "lifecycle-delete",
    route: "/settings",
    intent:
      "Видалення акаунта власним флоу: повторний вхід неможливий, повторна реєстрація на ту саму адресу можлива",
    lane: "lifecycle",
    automation: "manual",
  },
] as const;

/** Кроки, які виконує Playwright-спека (решта — чекліст людини). */
export const AUTO_STEPS: readonly BetaJourneyStep[] = BETA_JOURNEY.filter(
  (s) => s.automation === "auto",
);
