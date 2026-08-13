/**
 * Last validated: 2026-08-13
 * Status: Active
 *
 * Таксономія категорій РУЧНОЇ операції Фініка — одна таблиця на весь
 * монорепо.
 *
 * Навіщо окремий файл. Ручна форма історично має детальнішу розбивку,
 * ніж MCC-каталог банку: `groceries`, `cafe` і `tech` існують лише тут,
 * бо людина, яка вводить витрату руками, розрізняє продукти й ресторан,
 * а банк дає той самий MCC. Ці id вже лежать у persisted-блобах
 * (`finyk_manual_expenses_v1`), тож ані звести їх до `other`, ані
 * перейменувати міграцією при читанні не можна.
 *
 * AI-CONTEXT (2026-08-13): до цього файлу той самий список був
 * записаний ЧОТИРИ рази — підпис у `lib/categories.ts`, іконка в
 * `apps/web/.../txRowHelpers.ts`, колірний аліас у
 * `domain/categories.ts` і canonical-мапа в `domain/personalization.ts`.
 * Розходились вони по-різному й непомітно: `utilities` мала колір, але
 * не мала іконки; `cafe` мала колір, але в бюджетах лишалась окремою
 * категорією замість `restaurant`. Тому тут ОДИН рядок на категорію
 * несе всі чотири факти, а кожен споживач бере свою колонку.
 *
 * Правити тут — не в похідних мапах.
 */

export interface ManualCategoryDef {
  /** Id, що лягає у сховище (Era 3 slug). */
  readonly id: string;
  /** Підпис без емодзі — те, що бачить людина в чипі. */
  readonly label: string;
  /**
   * Емодзі-префікс для legacy-форми підпису (`"🍴 Їжа"`), яку віддають
   * `getCategory`-подібні резолвери. UI-и, що малюють іконку, зрізають
   * його — див. `stripLeadingEmoji`.
   */
  readonly emoji: string;
  /** Ім'я іконки зі спільного набору (`@shared/components/ui/Icon`). */
  readonly iconName: string;
  /**
   * Канонічна категорія MCC-каталогу, у яку ця ручна категорія
   * агрегується в бюджетах, аналітиці й палітрі. Дорівнює `id` для
   * більшості; відрізняється саме для трьох «зайвих» ручних слагів.
   */
  readonly canonicalId: string;
}

/** Категорії ручної ВИТРАТИ, у порядку показу в пікері. */
export const MANUAL_EXPENSE_TAXONOMY: readonly ManualCategoryDef[] = [
  {
    id: "food",
    label: "Їжа",
    emoji: "🍴",
    iconName: "utensils",
    canonicalId: "food",
  },
  {
    id: "groceries",
    label: "Продукти",
    emoji: "🛒",
    iconName: "shopping-cart",
    canonicalId: "food",
  },
  {
    id: "cafe",
    label: "Кафе та ресторани",
    emoji: "☕",
    iconName: "coffee",
    canonicalId: "restaurant",
  },
  {
    id: "transport",
    label: "Транспорт",
    emoji: "🚗",
    iconName: "truck",
    canonicalId: "transport",
  },
  {
    id: "entertainment",
    label: "Розваги",
    emoji: "🎮",
    iconName: "sparkles",
    canonicalId: "entertainment",
  },
  {
    id: "health",
    label: "Здоров'я",
    emoji: "💊",
    iconName: "heart",
    canonicalId: "health",
  },
  {
    id: "shopping",
    label: "Покупки",
    emoji: "🛍",
    iconName: "tag",
    canonicalId: "shopping",
  },
  {
    id: "utilities",
    label: "Комунальні",
    emoji: "🏠",
    iconName: "home",
    canonicalId: "utilities",
  },
  {
    id: "tech",
    label: "Техніка",
    emoji: "🖥",
    iconName: "monitor",
    canonicalId: "shopping",
  },
  {
    id: "subscriptions",
    label: "Підписки",
    emoji: "🎵",
    iconName: "repeat",
    canonicalId: "subscriptions",
  },
  {
    id: "education",
    label: "Навчання",
    emoji: "📚",
    iconName: "book",
    canonicalId: "education",
  },
  {
    id: "travel",
    label: "Подорожі",
    emoji: "✈️",
    iconName: "compass",
    canonicalId: "travel",
  },
  {
    id: "other",
    label: "Інше",
    emoji: "💳",
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
    emoji: "",
    iconName: "briefcase",
    canonicalId: "income",
  },
  {
    id: "freelance",
    label: "Фріланс",
    emoji: "",
    iconName: "monitor",
    canonicalId: "income",
  },
  {
    id: "gift",
    label: "Подарунок",
    emoji: "",
    iconName: "package",
    canonicalId: "income",
  },
  {
    id: "refund",
    label: "Повернення",
    emoji: "",
    iconName: "refresh-cw",
    canonicalId: "income",
  },
  {
    id: "other-income",
    label: "Інше",
    emoji: "",
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

/** Підпис у legacy-формі з емодзі-префіксом (`"🍴 Їжа"`). */
export function taxonomyLabel(def: ManualCategoryDef): string {
  return def.emoji ? `${def.emoji} ${def.label}` : def.label;
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
