import { MANUAL_INCOME_TAXONOMY } from "./lib/manualTaxonomy.js";

// Спеціальний ID для внутрішніх переказів між своїми рахунками.
// Транзакції з цією категорією НЕ рахуються у витратах і доходах.
export const INTERNAL_TRANSFER_ID = "internal_transfer";

export const MCC_CATEGORIES = [
  {
    id: "food",
    label: "Продукти",
    mccs: [5411, 5412, 5422, 5441, 5451, 5462, 5499],
    keywords: [
      "сільпо",
      "атб",
      "новус",
      "fora",
      "metro",
      "ашан",
      "продукт",
      "супермаркет",
      "grocery",
      "наш край",
      "rancho",
      "ранчо",
      "магазин",
      "садочок",
    ],
  },
  {
    id: "restaurant",
    label: "Кафе та ресторани",
    mccs: [5812, 5813, 5814],
    keywords: [
      "макдональд",
      "mcdonald",
      "pizza",
      "піца",
      "burger",
      "кафе",
      "ресторан",
      "суші",
      "sushi",
      "wok",
      "kfc",
      "domino",
    ],
  },
  {
    id: "transport",
    label: "Транспорт",
    mccs: [4111, 4121, 4131, 5541, 5542, 5172],
    keywords: [
      "uber",
      "bolt",
      "таксі",
      "заправка",
      "wog",
      "okko",
      "shell",
      "укрзалізниця",
      "метро",
    ],
  },
  {
    id: "subscriptions",
    label: "Підписки",
    mccs: [4899, 5735, 7372],
    keywords: [
      "spotify",
      "netflix",
      "apple",
      "google",
      "youtube",
      "steam",
      "chatgpt",
      "icloud",
      "openai",
    ],
  },
  {
    id: "health",
    label: "Здоровʼя",
    mccs: [5122, 5912, 8011, 8021, 8049, 8099],
    keywords: ["аптека", "лікар", "pharmacy", "клінік", "стоматолог"],
  },
  {
    id: "shopping",
    label: "Покупки",
    mccs: [5311, 5331, 5651, 5661, 5699, 5732, 5734, 5945],
    keywords: ["rozetka", "amazon", "zara", "h&m", "reserved", "allo"],
  },
  {
    id: "tech",
    label: "Техніка",
    mccs: [],
    keywords: ["техніка", "electronics", "comfy", "foxtrot", "цитрус"],
  },
  {
    id: "entertainment",
    label: "Розваги",
    mccs: [7832, 7922, 7993, 7996, 7999],
    keywords: ["кіно", "cinema", "multiplex"],
  },
  {
    id: "sport",
    label: "Спорт",
    mccs: [5941, 7941, 7997],
    keywords: ["спортмастер", "decathlon", "фітнес", "gym"],
  },
  {
    id: "beauty",
    label: "Краса",
    mccs: [5977, 7230, 7297],
    keywords: ["салон", "перукар", "барбер", "манікюр"],
  },
  {
    id: "smoking",
    label: "Цигарки",
    mccs: [5993],
    keywords: [
      "iqos",
      "heet",
      "heets",
      "стік",
      "стіки",
      "cig",
      "cigarette",
      "тютюн",
      "цигар",
    ],
  },
  {
    // MCC 5921 — спеціалізовані винні/пивні магазини. У чеку супермаркету
    // MCC один на весь кошик (5411), тож сюди позиція потрапляє не з
    // MCC, а зі спліту за чеком (`receiptSplitSuggestion.ts`).
    id: "alcohol",
    label: "Алкоголь",
    mccs: [5921],
    keywords: [
      "алкогол",
      "вино",
      "пиво",
      "віскі",
      "коньяк",
      "горілк",
      "лікер",
      "шампанськ",
      "wine",
      "beer",
      "whisky",
    ],
  },
  {
    id: "education",
    label: "Навчання",
    mccs: [5942, 8220, 8299],
    keywords: ["книг", "курс", "udemy", "coursera"],
  },
  {
    // Комунальні існували ЛИШЕ у `lib/manualTaxonomy.ts` (з `canonicalId`,
    // що вказує сам на себе), а цей список — джерело для
    // `mergeExpenseCategoryDefinitions` → `buildExpenseCategoryList`, тобто
    // для пікера бюджетного ліміту і для розбивки витрат по категоріях.
    // Наслідок: витрату «Комунальні» завести можна, а ліміт на неї — ні, і в
    // категорійній аналітиці ці гроші не показувались взагалі (browser-QA
    // 2026-09-02). Це той самий клас розходження, що вже ловили 2026-08-25
    // для `cafe→restaurant` і `tech→shopping` — там міст добудували, тут ні.
    //
    // `mccs` порожній навмисно: банк не має MCC для комуналки, категорія
    // приходить лише з ручного вводу, де людина обирає її явно. `keywords`
    // працюють по опису транзакції і тому корисні.
    //
    // «інтернет» звідси переїхав у `telecom` (2026-10-01): доти це був
    // єдиний кошик, куди провайдера можна було покласти, а відтоді звʼязок
    // має власну категорію.
    id: "utilities",
    label: "Комунальні",
    mccs: [],
    keywords: [
      "комунал",
      "квартплат",
      "оселя",
      "газ",
      "електро",
      "світло",
      "опалення",
      "водоканал",
    ],
  },
  {
    // «Інше» — та сама діра, що й `utilities` вище, і знайдена разом із нею:
    // ручний ввід дозволяє обрати цю категорію, а розбивка витрат будується з
    // цього списку, тож гроші, покладені в «Інше», у категорійній аналітиці
    // не показувались узагалі. Це ще й категорія-фолбек для сплітів
    // (`TxRowSplitEditor` кладе туди `categoryId: "other"`), тобто наповнити
    // її легко, навіть не обираючи свідомо.
    //
    // `mccs` порожній: це навмисний кошик «не підпадає під жодну», а не
    // банківський клас. `keywords` теж порожні — інакше вона перехоплювала б
    // транзакції в осмислені категорії.
    id: "other",
    label: "Інше",
    mccs: [],
    keywords: [],
  },
  {
    id: "travel",
    label: "Подорожі",
    mccs: [3000, 4411, 4511, 7011, 7012],
    keywords: ["готель", "hotel", "airbnb", "booking", "aviasales", "авіа"],
  },
  {
    // AI-DANGER: 4829 сюди НЕ додавати — перевірено на живих даних двічі.
    //
    // 4829 («переказ коштів») додавали 2026-09-11, щоб щомісячний платіж по
    // кредитці перестав падати в «Інше». Ціна була відома й записана в
    // канон як прийнятна («p2p-перекази друзям теж стартують як борг, доки
    // людина не перекатегоризує»). Живі дані показали, що вона неприйнятна:
    // звіт власника 2026-09-12 зі скріншотом Операцій — майже ВЕСЬ список
    // під фільтром «Борги та кредити» складався з переказів, які боргом не
    // є (переказ на власну картку, p2p людині на імʼя, переказ на номер
    // картки). Причина структурна, не в порозі: Monobank стамплює 4829
    // будь-який card-to-card, тож код несе доказ «це переказ», а не доказ
    // «це борг», і кошик наповнюється переказами швидше, ніж боргами.
    //
    // Той самий висновок уже стояв у репо з іншого боку —
    // `docs/engineering/architecture/metric-registry.md` про дайджест:
    // «тихо викидати все з MCC 4829 означало б гадати за людину». Тихо
    // ПОЗНАЧАТИ все з 4829 боргом — та сама здогадка, лише голосніша, бо
    // в стрічці її видно чипом.
    //
    // Борг тепер визначається доказом, а не кодом переказу, трьома
    // наявними шарами: (1) ключові слова опису нижче («погашення»,
    // «кредит», «розстрочка» …) — вони працюють НЕЗАЛЕЖНО від MCC, тож
    // «Погашення наступного платежу» лишається боргом і без 4829;
    // (2) `autoLinkKeyword` пасиву (`debtAutoLink.ts`, Level 2) — людина
    // один раз називає свій платіж, і далі він привʼязується сам;
    // (3) парний матчер переказів (`transferMatching.ts`), який ловить рух
    // на власну картку і за дизайном ВИМАГАЄ підтвердження.
    //
    // 6012/6051/6099 лишаються: це коди фінустанов і квазі-готівки, які
    // card-to-card не стамплюють. 6010/6011 (готівка в касі/банкоматі)
    // СВІДОМО не тут: зняття готівки — не борг, а майбутній міст до
    // «Готівки на руках» (ADR-0076).
    id: "debt",
    label: "Борги та кредити",
    mccs: [6012, 6051, 6099],
    keywords: [
      "погашення",
      "кредит",
      "позика",
      "розстрочка",
      "izibank",
      "credit",
      "loan",
      "борг",
    ],
  },
  {
    id: "charity",
    label: "Благодійність",
    mccs: [8398, 8399],
    keywords: [
      "благодійн",
      "донат",
      "збір",
      "фонд",
      "помощь",
      "charity",
      "donate",
      "united24",
      "прапор",
      "savelife",
      "come back alive",
    ],
  },
  // ── П'ять базових категорій витрат, додані 2026-10-01 (рішення власника,
  // «c1» — дані власника показали реальні діри: «lifecell» падав в «Інше», а
  // переказ на картку людині — більша частина самого «Інше»). Порядок у
  // списку = порядок ПОКАЗУ в пікерах, тому вони йдуть після старих
  // категорій. Порядок РЕЗОЛВУ — окремо, див. `CATEGORY_RESOLUTION_ORDER`.
  {
    // MCC 4899 (кабельне/супутникове ТБ, стрімінг) ТУТ НЕ додано навмисно:
    // він уже в `subscriptions`, і це не помилка — Netflix, Spotify й
    // кабельні пакети платяться саме ним. Перекладати його сюди означало б
    // викрасти підписки; провайдер із 4899 лишається «Підписками», а на
    // «Звʼязок та інтернет» його переводить ручне перекатегоризування.
    //
    // 4816 («мережеві/інформаційні послуги комп'ютерів») — це ISP; 4812 —
    // телеком-обладнання й телефони; 4814 — оператори звʼязку.
    //
    // «інтернет» — ключове слово переїхало з `utilities`. Категорія стоїть
    // у списку ПІСЛЯ покупок, тож «Інтернет-магазин» з MCC покупок, як і
    // раніше, лишається покупкою (MCC-збіг у `shopping` ловиться раніше).
    id: "telecom",
    label: "Звʼязок та інтернет",
    mccs: [4812, 4814, 4816],
    keywords: [
      "kyivstar",
      "київстар",
      "lifecell",
      "лайфсел",
      "vodafone",
      "водафон",
      "ukrtelecom",
      "укртелеком",
      "datagroup",
      "датагруп",
      "triolan",
      "тріолан",
      "volia",
      "інтернет",
      "провайдер",
      "поповнення мобільного",
      "поповнення телефону",
    ],
  },
  {
    // Господарство й ремонт: склади/гіпермаркети будматеріалів, меблі,
    // оздоблення. 5722 (побутова техніка) свідомо не тут — це «Техніка».
    id: "home",
    label: "Дім і ремонт",
    mccs: [5200, 5211, 5231, 5251, 5261, 5712, 5713, 5714, 5718, 5719],
    keywords: [
      "епіцентр",
      "epicentr",
      "нова лінія",
      "jysk",
      "ikea",
      "леруа",
      "leroy merlin",
      "меблі",
      "будмаркет",
      "будівельн",
    ],
  },
  {
    // MCC 742 — ветеринарні послуги. Записаний БЕЗ нуля попереду: літерал
    // `0742` у JS — застарілий вісімковий (SyntaxError у модулях), а
    // Monobank шле код числом 742.
    //
    // Ключового слова «зоо» самого по собі немає: воно зловило б «Зоопарк»
    // (розваги). «Аптека» в «Ветаптека» ловиться здоровʼям, якби не
    // `CATEGORY_RESOLUTION_ORDER` — ця категорія перевіряється раніше.
    id: "pets",
    label: "Тварини",
    mccs: [742, 5995],
    keywords: [
      "masterzoo",
      "мастерзоо",
      "мастер зоо",
      "зоомагазин",
      "зоотовар",
      "petshop",
      "pet shop",
      "ветеринар",
      "ветклінік",
      "ветаптек",
      "ветлікар",
    ],
  },
  {
    // Id у множині: `gift` уже зайнятий надходженням «Подарунок»
    // (`MANUAL_INCOME_TAXONOMY`), а `MANUAL_TAXONOMY_BY_ID` тримає обидва
    // напрями в одній мапі — колізія тихо підмінила б один іншим.
    //
    // «квіт» без закінчення не береться: «Аванс за квітень» у описі
    // переказу став би подарунком.
    id: "gifts",
    label: "Подарунки",
    mccs: [5193, 5947, 5992],
    keywords: [
      "квіти",
      "квітів",
      "квіткови",
      "квіткар",
      "флорист",
      "flowers",
      "florist",
      "букет",
      // Дві форми: «подарунок» → «подарунк-а/-у/-и» (випадне о), і один
      // корінь обидві не покриває.
      "подарунок",
      "подарунк",
      "gift",
    ],
  },
  {
    // Перекази ЛЮДЯМ (p2p), не між власними рахунками. Внутрішній переказ
    // лишається окремою категорією `internal_transfer` і ПЕРЕМАГАЄ: її
    // ставить явний override (підтверджена пара парного матчера), а
    // override завжди сильніший за будь-яку евристику.
    //
    // `mccs` порожній НАВМИСНО — див. `P2P_TRANSFER_MCCS` нижче: код 4829
    // не можна класти в каталог, бо звідси його читає сервер і штампує
    // `category_slug` у БД назавжди.
    //
    // Стоїть ПІСЛЯ `debt`: «Переказ на кредитну картку» несе доказ боргу
    // («кредит»), і він сильніший за слабкий доказ «це переказ».
    id: "p2p_transfer",
    label: "Перекази людям",
    mccs: [],
    keywords: [
      "переказ на картку",
      "переказ на карту",
      "переказ коштів",
      "p2p",
      "card2card",
      "card to card",
      "з картки на картку",
    ],
  },
  {
    id: INTERNAL_TRANSFER_ID,
    label: "Внутрішній переказ",
    mccs: [],
    keywords: [],
  },
];

/** Id категорії «Перекази людям» — для коду, якому потрібен лише слаг. */
export const P2P_TRANSFER_ID = "p2p_transfer";

/**
 * MCC, яким Monobank стамплює будь-який card-to-card переказ: 4829
 * («переказ коштів»). Це доказ «це переказ», а не «це переказ ЛЮДИНІ»: тим
 * самим кодом їде й переказ на власну картку. Тому код дає лише слабку,
 * останню в черзі підказку — `getCategory` застосовує її після всіх
 * ключових слів, а рух між власними рахунками відсікає явний override
 * `internal_transfer` (підтверджена пара парного матчера).
 *
 * AI-DANGER: 4829 НЕ можна класти в `mccs` жодної категорії каталогу.
 * Сервер будує з `mccs` мапу `categorizeMcc` і при вставці транзакції
 * штампує `mono_transaction.category_slug`; веб читає цей слаг як
 * канонічний `categoryId` і до клієнтської евристики вже не доходить.
 * Тобто штамп (1) не бачить опису, а отже відніс би поповнення чужої банки
 * («Поповнення «…»» → «Інше», рішення 4Б 2026-10-01) і переказ, який
 * користувач потім підтвердив як внутрішній, у «Перекази людям»; (2)
 * живе вічно й виправляється лише міграцією — так і сталось із боргом
 * (міграція 136, журнал 2026-09-12). Тому 4829 читає ТІЛЬКИ клієнтський
 * резолвер, де є і опис, і override.
 *
 * Те саме каже тест `digestFinykSources.test.ts`: у `MCC_CATEGORIES` цього
 * коду немає й не має бути.
 */
export const P2P_TRANSFER_MCCS: readonly number[] = [4829];

/**
 * Категорії, які резолвер перевіряє РАНІШЕ за решту, хоча в списку показу
 * вони стоять у кінці.
 *
 * Резолв іде «категорія за категорією, у кожній MCC або ключове слово,
 * перший збіг виграє», тож порядок масиву — це ще й пріоритет. Загальне
 * слово «магазин» у «Продуктах» зловило б «Зоомагазин», «Квітковий
 * магазин» і «Меблевий магазин» раніше за їхні власні категорії, а
 * «аптек» у здоровʼї — «Ветаптеку». Ці три категорії несуть вужчі докази
 * (бренд, MCC спеціалізованої торгівлі), тож перевіряються першими.
 * Переставити їх у самому масиві не можна: порядок масиву — це порядок
 * у пікерах (бюджети, фільтри, чат-контекст), і «Тварини» не мають стояти
 * вище за «Продукти».
 */
const SPECIFIC_FIRST_IDS: ReadonlySet<string> = new Set([
  "pets",
  "home",
  "gifts",
]);

export const CATEGORY_RESOLUTION_ORDER = [
  ...MCC_CATEGORIES.filter((c) => SPECIFIC_FIRST_IDS.has(c.id)),
  ...MCC_CATEGORIES.filter((c) => !SPECIFIC_FIRST_IDS.has(c.id)),
];

/**
 * Мінімальна форма кастомної категорії, потрібна `mergeExpenseCategoryDefinitions`.
 * Keep loose — runtime payload може мати додаткові поля (emoji, color).
 */
export interface CustomCategoryInput {
  id: string;
  label?: string;
  /** Records created before the split are expense categories. */
  kind?: "expense" | "income" | undefined;
}

function isCustomCategoryInput(v: unknown): v is CustomCategoryInput {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { id?: unknown }).id === "string"
  );
}

/** Базові категорії витрат + користувацькі (селекти, графіки). */
export function mergeExpenseCategoryDefinitions(
  customCategories: readonly unknown[] = [],
) {
  const base = MCC_CATEGORIES.filter((c) => c.id !== INTERNAL_TRANSFER_ID);
  const extra = customCategories
    .filter(isCustomCategoryInput)
    .filter((c) => c.kind !== "income")
    .map((c) => ({
      id: c.id,
      label: c.label ?? "",
      mccs: [] as number[],
      keywords: [] as string[],
    }));
  return [...base, ...extra];
}

export function mergeIncomeCategoryDefinitions(
  customCategories: readonly unknown[] = [],
) {
  const extra = customCategories
    .filter(isCustomCategoryInput)
    .filter((c) => c.kind === "income")
    .map((c) => ({ id: c.id, label: c.label ?? "", keywords: [] as string[] }));
  const builtins = MANUAL_INCOME_TAXONOMY.map((c) => ({
    id: c.id,
    label: c.label,
    keywords: [] as string[],
  }));
  return [
    ...builtins,
    {
      id: INTERNAL_TRANSFER_ID,
      label: "Внутрішній переказ",
      keywords: [] as string[],
    },
    ...extra,
  ];
}

export const INCOME_CATEGORIES = [
  {
    id: "in_salary",
    label: "Зарплата",
    keywords: ["зарплата", "зп ", " зп", "аванс", "виплата", "salary"],
  },
  {
    id: "in_freelance",
    label: "Фріланс",
    keywords: ["upwork", "payoneer", "toptal", "freelance", "фріланс"],
  },
  { id: INTERNAL_TRANSFER_ID, label: "Внутрішній переказ", keywords: [] },
  {
    id: "in_cashback",
    label: "Кешбек",
    keywords: ["cashback", "кешбек", "бонус", "повернення"],
  },
  {
    id: "in_pension",
    label: "Пенсія/соц.",
    keywords: ["пенсія", "соц", "виплата держ", "допомога"],
  },
  // keywords навмисно порожні: автокатегоризація за словами дала б хибні
  // спрацювання на «повернення боргу» (спека finyk-observations, PR-3).
  { id: "in_debt", label: "Борг", keywords: [] },
  { id: "in_other", label: "Надходження", keywords: [] },
];

export const DEFAULT_SUBSCRIPTIONS = [
  {
    id: "chatgpt",
    name: "ChatGPT Plus",
    emoji: "🤖",
    keyword: "openai",
    billingDay: 19,
    currency: "USD",
  },
  {
    id: "gmail",
    name: "Gmail 100GB",
    emoji: "📧",
    keyword: "google storage",
    billingDay: 11,
    currency: "USD",
  },
  {
    id: "gphotos",
    name: "Google Фото",
    emoji: "📸",
    keyword: "google one",
    billingDay: 29,
    currency: "USD",
  },
  {
    id: "icloud",
    name: "iCloud+ 200GB",
    emoji: "☁️",
    keyword: "icloud",
    billingDay: 17,
    currency: "USD",
  },
  {
    id: "youtube",
    name: "YouTube Premium",
    emoji: "▶️",
    keyword: "youtube",
    billingDay: 12,
    currency: "UAH",
  },
  {
    id: "netflix",
    name: "Netflix",
    emoji: "🎬",
    keyword: "netflix",
    billingDay: 21,
    currency: "UAH",
  },
  {
    id: "spotify",
    name: "Spotify",
    emoji: "🎵",
    keyword: "spotify",
    billingDay: 29,
    currency: "UAH",
  },
];

export const PAGES = [
  { id: "overview", label: "Огляд" },
  { id: "transactions", label: "Операції" },
  { id: "budgets", label: "Планування" },
  { id: "analytics", label: "Аналітика" },
  { id: "assets", label: "Активи та пасиви" },
];

export const CURRENCY = {
  UAH: 980,
  USD: 840,
  EUR: 978,
};

/** ISO-4217 numeric currency code → display symbol. Unknown codes are the
 *  caller's responsibility to fall back (defaults to `₴` in practice —
 *  every currency the app supports is one of the three keys above). */
export const CURRENCY_SYMBOL: Record<number, string> = {
  [CURRENCY.UAH]: "₴",
  [CURRENCY.USD]: "$",
  [CURRENCY.EUR]: "€",
};
