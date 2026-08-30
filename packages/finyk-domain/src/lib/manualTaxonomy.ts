/**
 * Last validated: 2026-08-21
 * Status: Active
 *
 * Таксономія категорій РУЧНОЇ операції Фініка — одна таблиця на весь
 * монорепо.
 *
 * Навіщо окремий файл. Ручна форма історично має детальнішу розбивку,
 * ніж MCC-каталог банку: `cafe` і `tech` існують лише тут, бо людина,
 * яка вводить витрату руками, розрізняє ресторан і техніку, а банк дає
 * той самий MCC. Ці id вже лежать у persisted-блобах
 * (`finyk_manual_expenses_v1`), тож ані звести їх до `other`, ані
 * перейменувати міграцією при читанні не можна — звідси `legacy`.
 *
 * AI-CONTEXT (2026-08-13): до цього файлу той самий список був
 * записаний ЧОТИРИ рази — підпис у `lib/categories.ts`, іконка в
 * `apps/web/.../txRowHelpers.ts`, колірний аліас у
 * `domain/categories.ts` і canonical-мапа в `domain/personalization.ts`.
 * Розходились вони по-різному й непомітно: `utilities` мала колір, але
 * не мала іконки; `cafe` мала колір, але в бюджетах лишалась окремою
 * категорією замість `restaurant`. Тому тут ОДИН рядок на категорію
 * несе всі факти, а кожен споживач бере свою колонку.
 *
 * AI-CONTEXT (2026-08-21): до цієї дати рядок мав ще й колонку `emoji`,
 * а `taxonomyLabel()` клеїла її перед підписом — резолвери віддавали
 * `"🛒 Продукти"`. Гліф малювався системним емодзі-шрифтом, тобто
 * по-різному на кожній ОС, не брав `currentColor` і не мав теми; ті
 * поверхні, що вже малювали іконку, зрізали його рядком
 * (`stripLeadingEmoji`), а ті, що не знали про це, показували емодзі як
 * «іконку». Звідси репорт тестувальника: у картці ліміту емодзі було, у
 * рядку транзакції — справжня іконка. Тепер `label` завжди чистий, а
 * гліф бере `iconName`. Той самий крок Рутина зробила 2026-08-03
 * (`packages/routine-domain/src/glyphs.ts`).
 *
 * Правити тут — не в похідних мапах.
 */

import type { CategoryIconName } from "./categoryIcons.js";
import { foldApostrophes } from "@sergeant/shared";

export interface ManualCategoryDef {
  /** Id, що лягає у сховище (Era 3 slug). */
  readonly id: string;
  /** Підпис, який бачить людина в чипі. Ніколи не містить емодзі. */
  readonly label: string;
  /**
   * Slug гліфа із закритого набору `CATEGORY_ICON_SLUGS`
   * (`./categoryIcons.ts`). Тип — лише на рівні типів, тож рантайм-циклу
   * між модулями немає.
   */
  readonly iconName: CategoryIconName;
  /**
   * Канонічна категорія MCC-каталогу, у яку ця ручна категорія
   * агрегується в бюджетах, аналітиці й палітрі. Дорівнює `id` для
   * більшості; відрізняється саме для «зайвих» ручних слагів.
   */
  readonly canonicalId: string;
  /**
   * Слаг, який більше НЕ пропонується в пікері, але лишається в
   * резолві: його вже записано в persisted-блоби, тож підпис, колір та
   * іконку для нього треба вміти віддати. Див. `groceries`.
   */
  readonly legacy?: boolean;
}

/** Категорії ручної ВИТРАТИ — усі, разом із legacy-аліасами для резолву. */
export const MANUAL_EXPENSE_TAXONOMY: readonly ManualCategoryDef[] = [
  {
    id: "food",
    label: "Продукти",
    iconName: "shopping-cart",
    canonicalId: "food",
  },
  {
    // Той самий кошик, що й `food` — обидва зводяться до канонічної
    // категорії «Продукти». У пікері лишився ОДИН чип (`food`, бо це
    // канонічний id MCC-каталогу); `groceries` живе далі як read-only
    // аліас, бо цей слаг уже лежить у persisted-блобах і викидати його
    // з резолву означало б перетворити старі записи на «Інше».
    id: "groceries",
    label: "Продукти",
    iconName: "shopping-cart",
    canonicalId: "food",
    legacy: true,
  },
  {
    id: "cafe",
    label: "Кафе та ресторани",
    iconName: "coffee",
    canonicalId: "restaurant",
  },
  {
    id: "transport",
    label: "Транспорт",
    iconName: "truck",
    canonicalId: "transport",
  },
  {
    id: "entertainment",
    label: "Розваги",
    iconName: "sparkles",
    canonicalId: "entertainment",
  },
  {
    id: "health",
    label: "Здоровʼя",
    iconName: "heart",
    canonicalId: "health",
  },
  {
    id: "shopping",
    label: "Покупки",
    iconName: "tag",
    canonicalId: "shopping",
  },
  {
    // Обидві категорії вже жили в MCC-каталозі (`smoking`) або зʼявились
    // разом із ним (`alcohol`), але в ручному пікері їх не було — тож
    // спліт за чеком Сільпо не мав куди покласти цигарки й алкоголь і
    // зсипав їх у «Продукти» (репорт founder-а, 2026-08-25).
    id: "smoking",
    label: "Цигарки",
    iconName: "tag",
    canonicalId: "smoking",
  },
  {
    id: "alcohol",
    label: "Алкоголь",
    iconName: "tag",
    canonicalId: "alcohol",
  },
  {
    id: "utilities",
    label: "Комунальні",
    iconName: "home",
    canonicalId: "utilities",
  },
  {
    id: "tech",
    label: "Техніка",
    iconName: "monitor",
    canonicalId: "shopping",
  },
  {
    id: "subscriptions",
    label: "Підписки",
    iconName: "repeat",
    canonicalId: "subscriptions",
  },
  {
    id: "education",
    label: "Навчання",
    iconName: "book",
    canonicalId: "education",
  },
  {
    id: "travel",
    label: "Подорожі",
    iconName: "compass",
    canonicalId: "travel",
  },
  {
    id: "other",
    label: "Інше",
    iconName: "tag",
    canonicalId: "other",
  },
];

/**
 * Категорії ручного НАДХОДЖЕННЯ. Свідомо окремий, короткий набір
 * (fab-and-manual-income spec §2) — без legacy-ер, бо таксономія
 * стартувала одразу слагами.
 *
 * `canonicalId` в усіх однаковий: палітра має ОДИН тир `income` на всі
 * надходження. Вільного hue на п'ять окремих кольорів на дузі вже
 * немає, а розрізняє види доходу підпис, не відтінок — рішення власника
 * 2026-08-13. До нього кожен чип доходу віддавав перший fallback-тир,
 * тобто малювався кольором категорії «Транспорт».
 */
export const MANUAL_INCOME_TAXONOMY: readonly ManualCategoryDef[] = [
  {
    id: "salary",
    label: "Зарплата",
    iconName: "briefcase",
    canonicalId: "income",
  },
  {
    id: "freelance",
    label: "Фріланс",
    iconName: "monitor",
    canonicalId: "income",
  },
  {
    id: "gift",
    label: "Подарунок",
    iconName: "package",
    canonicalId: "income",
  },
  {
    id: "refund",
    label: "Повернення",
    iconName: "refresh-cw",
    canonicalId: "income",
  },
  {
    id: "other-income",
    label: "Інше",
    iconName: "tag",
    canonicalId: "income",
  },
];

/**
 * Легасі income-id з MCC-каталогу плюс внутрішній переказ. Кольору вони
 * теж не мали й діставали той самий fallback, тому агрегуються в той
 * самий тир `income`.
 */
export const LEGACY_INCOME_IDS: readonly string[] = [
  "in_salary",
  "in_freelance",
  "in_cashback",
  "in_pension",
  "in_other",
  "income",
  "internal_transfer",
];

/**
 * Те, що показує пікер: без legacy-аліасів, тобто без двох чипів на один
 * кошик. Резолвери навпаки читають повну таблицю.
 */
export const MANUAL_EXPENSE_PICKER: readonly ManualCategoryDef[] =
  MANUAL_EXPENSE_TAXONOMY.filter((d) => !d.legacy);

/**
 * Зрізає провідні емодзі й пробіл: `"🍴 їжа"` → `"їжа"`.
 *
 * Приймає будь-який пробіг не-літер і не-цифр, тож складені емодзі
 * (ZWJ-послідовності, variation selectors) знімаються цілком.
 */
export function stripCategoryEmoji(raw: string): string {
  const s = String(raw || "");
  let i = 0;
  while (i < s.length && !/[\p{L}\p{N}]/u.test(s[i] ?? "")) i++;
  return s.slice(i).trim();
}

/**
 * Підписи Ер 1–2 → слаг Ери 3.
 *
 * Ера 1 зберігала голий український підпис (`"їжа"`), Ера 2 — той самий
 * підпис з емодзі-префіксом (`"🍴 їжа"`). Після зрізання емодзі обидві
 * форми збігаються, тож мапа одна.
 *
 * База будується з самої таксономії, тому нові категорії підхоплюються
 * автоматично. Нижче — лише ті підписи, яких у поточній таблиці вже
 * немає: колишня «Їжа», коротке «кафе», обрізане «здоров» і «одяг»,
 * що став «Покупками».
 *
 * `продукти` резолвиться у `food`, а не в legacy-аліас `groceries`:
 * підпис у обох однаковий, але `food` — канонічний id, який лишився в
 * пікері. Мапити в `groceries` означало б, що форма редагування старого
 * запису відкривається на слагу, якого в списку опцій уже нема.
 */
const LEGACY_LABEL_TO_ID: ReadonlyMap<string, string> = new Map([
  ...MANUAL_EXPENSE_TAXONOMY.filter((d) => !d.legacy).map(
    (d) => [foldApostrophes(d.label.toLocaleLowerCase("uk-UA")), d.id] as const,
  ),
  ["їжа", "food"],
  ["кафе", "cafe"],
  ["здоров", "health"],
  ["одяг", "shopping"],
]);

/**
 * Слаг Ери 3 для підпису Ер 1–2, або `undefined` для незнайомого рядка.
 *
 * Свідомо `undefined`, а не `"other"`: цю функцію викликають ДО падіння
 * в дефолт, і власна категорія користувача теж «незнайома» — звести її
 * до «Інше» означало б підмінити дані мовчки.
 */
export function legacyManualCategoryId(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  // AI-DANGER: згортання апострофа (канон §1.10) — не косметика. Підпис
  // «Здоров'я» через ASCII `'` лежить у persisted-блобах, які писали
  // попередні версії; ключ мапи канонічний (`ʼ`). Без згортання ці записи
  // перестануть резолвитись і мовчки поїдуть у «Інше».
  const key = foldApostrophes(
    stripCategoryEmoji(raw.trim()).toLocaleLowerCase("uk-UA"),
  );
  return LEGACY_LABEL_TO_ID.get(key);
}

/**
 * Точний (без нормалізації регістру) резолв id → канонічна категорія.
 * Невідомий id повертається як є — кастомні категорії крізь цю функцію
 * проходять недоторканими, на відміну від
 * `manualCategoryToCanonicalId`, яка ще й ловить українські підписи Ер
 * 1–2 і тому зводить рядок до нижнього регістру.
 */
export function canonicalManualCategoryId(categoryId: string): string {
  return MANUAL_TAXONOMY_BY_ID.get(categoryId)?.canonicalId ?? categoryId;
}

/** `id → def` для обох таксономій разом. */
export const MANUAL_TAXONOMY_BY_ID: ReadonlyMap<string, ManualCategoryDef> =
  new Map(
    [...MANUAL_EXPENSE_TAXONOMY, ...MANUAL_INCOME_TAXONOMY].map((d) => [
      d.id,
      d,
    ]),
  );
