/**
 * Дизайн багатопрофільного браузерного тестування (`e2e:profiles`).
 *
 * Ідея: замість одного «типового» користувача проганяємо кілька **тимчасових**
 * профілів, які відрізняються трьома осями — стан акаунта, стан даних, тариф —
 * і ганяємо кожен по одній і тій самій матриці дій. Розбіжність між профілями
 * на однаковій дії і є знахідкою: саме там ховаються баги «працює у мене»,
 * які не ловить smoke-лейн з єдиним seeded-користувачем.
 *
 * Осі профілю:
 *   - `account`: `anonymous` (без акаунта) | `fresh` (щойно signup) | `returning`
 *     (той самий акаунт на чистому пристрої — порожній localStorage/SQLite)
 *   - `data`: `empty` | `seeded` (профіль сам створює записи в межах прогону)
 *   - `plan`: `free` | `pro` (Pro вмикається рядком у `subscriptions`, див.
 *     README лейна; UI-шлях оплати локально недоступний)
 *
 * Лейн локальний і НЕ підключений у CI — так само як `e2e:mobile`. Він
 * навмисно повільний (реальний signup через UI, реальні CRUD-дії, реальна
 * синхронізація), тому живе поруч зі smoke-лейном, а не всередині нього.
 *
 * Історія: матрицю зафіксовано браузерним аудитом 2026-08-05,
 * `docs/90-work/audits/2026-08-05-browser-profile-testing.md`.
 */

export type AccountState = "anonymous" | "fresh" | "returning";
export type DataState = "empty" | "seeded";
export type PlanState = "free" | "pro";

export interface TestProfile {
  /** Стабільний ідентифікатор — використовується в іменах тестів і скріншотів. */
  id: string;
  /** Людський опис — що саме моделює профіль. */
  title: string;
  account: AccountState;
  data: DataState;
  plan: PlanState;
  /** Питання, на яке цей профіль відповідає. */
  question: string;
}

export const PROFILES: readonly TestProfile[] = [
  {
    id: "P1-anon-cold",
    title: "Анонім, холодний старт",
    account: "anonymous",
    data: "empty",
    plan: "free",
    question:
      "Чи можна користуватись усіма модулями без акаунта і чи не показуємо ми йому екранів, які потребують сесії?",
  },
  {
    id: "P2-free-fresh",
    title: "Free, щойно зареєструвався",
    account: "fresh",
    data: "seeded",
    plan: "free",
    question:
      "Що бачить людина одразу після signup і чи доводить її застосунок до першого реального запису?",
  },
  {
    id: "P3-free-returning",
    title: "Free, той самий акаунт на новому пристрої",
    account: "returning",
    data: "seeded",
    plan: "free",
    question:
      "Чи повертається стан (дані І налаштування) при вході на чистому пристрої?",
  },
  {
    id: "P4-pro",
    title: "Premium-підписник",
    account: "fresh",
    data: "seeded",
    plan: "pro",
    question:
      "Чи справді тариф знімає ті гейти, які обіцяє `/pricing`, і чи не показуємо ми платнику пропозицію купити?",
  },
] as const;

/**
 * Матриця дій. Кожен профіль проходить УСІ кроки — навіть ті, що для нього
 * очікувано недоступні: «недоступно» теж має виглядати як продумана відповідь,
 * а не як порожній екран чи мовчазний no-op.
 */
export interface JourneyStep {
  id: string;
  /** Маршрут, з якого починається крок. */
  route: string;
  /** Що робимо і що саме перевіряємо. */
  intent: string;
}

export const JOURNEY: readonly JourneyStep[] = [
  {
    id: "hub",
    route: "/",
    intent: "Хаб: скільки модулів активно, чи є вхід у перший крок",
  },
  {
    id: "finyk-expense",
    route: "/finyk/transactions",
    intent: "Додати витрату і побачити її у списку",
  },
  {
    id: "finyk-income",
    route: "/finyk/transactions",
    intent: "Перемкнути на «Надходження» і зберегти",
  },
  {
    id: "finyk-analytics",
    route: "/finyk/analytics",
    intent: "Аналітика рендериться з одним записом",
  },
  {
    id: "finyk-assets",
    route: "/finyk/assets",
    intent: "Активи: форма додавання, валюта",
  },
  { id: "routine-habit", route: "/routine/habits", intent: "Створити звичку" },
  {
    id: "routine-check",
    route: "/routine",
    intent: "Відмітити звичку і побачити зміну лічильника",
  },
  {
    id: "nutrition-pantry",
    route: "/nutrition/pantry",
    intent: "Додати продукт у комору",
  },
  {
    id: "nutrition-goals",
    route: "/nutrition/menu",
    intent: "Виставити денні цілі КБЖВ",
  },
  { id: "fizruk", route: "/fizruk", intent: "Огляд і порожній стан тренувань" },
  {
    id: "insights-pdf",
    route: "/insights",
    intent: "Експорт PDF: гейт для free, доступ для pro",
  },
  {
    id: "pricing",
    route: "/pricing",
    intent: "Чи правильно позначено поточний тариф",
  },
  {
    id: "chat",
    route: "/chat",
    intent: "Ліміт AI-повідомлень залежно від тарифу",
  },
  {
    id: "settings",
    route: "/settings",
    intent: "Налаштування відкриваються, розділ модулів на місці",
  },
];
