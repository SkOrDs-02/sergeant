import { categorizeMcc } from "../../mono/mccCategories.js";
import {
  getCategory,
  getIncomeCategory,
} from "@sergeant/finyk-domain/lib/categories";
import type { ImportDirection } from "@sergeant/shared";

/**
 * Категорія для рядка імпорту — підказка, не рішення.
 *
 * Досі КОЖЕН імпортований рядок приїжджав у bulk-review з дефолтом
 * («Інше» для витрати, «Зарплата» для доходу), і 27-рядкову виписку
 * доводилось розкладати руками по одній. Тим часом evidence у файлі вже
 * була: Privat24 віддає власну колонку «Категорія», mono — «МСС», а опис
 * операції несе назву мерчанта.
 *
 * Три шари доказів, від найнадійнішого до найслабшого:
 *   1. **Категорія самого банку** — людина-агностична розмітка від того,
 *      хто бачив термінал; є в Privat24.
 *   2. **MCC** (ISO 18245) — є в mono; резолвиться наявним
 *      `categorizeMcc` (той самий каталог, що й mono-вебхук у проді).
 *   3. **Ключові слова опису** — наявний `getCategory` / `getIncomeCategory`
 *      з `@sergeant/finyk-domain` (ті самі списки мерчантів, якими
 *      категоризуються mono-транзакції). Працює для БУДЬ-ЯКОГО банку,
 *      навіть коли ні категорії, ні MCC у файлі немає.
 *
 * `null` = доказів немає. Свідомо НЕ повертаємо «other»/«salary»: клієнт
 * підставляє власний дефолт сам, і мовчазне «Інше» від сервера
 * неможливо було б відрізнити від «сервер справді вирішив, що це Інше».
 *
 * AI-CONTEXT: жоден шар нічого не ЗАПИСУЄ — рядок усе одно проходить
 * обовʼязковий редагований bulk-review, де категорія міняється в один
 * тап (і масово через «застосувати до всіх»). Тому помилка підказки
 * коштує одного кліку, а влучання економлює десятки.
 */

/**
 * MCC-каталог (`@sergeant/finyk-domain/constants`) і ручний пікер мають
 * РІЗНІ id для тих самих кошиків — історично, бо каталог зростав під
 * mono-вебхук, а пікер під форму. Міст явний, щоб підказка не приносила
 * у поле `category` слаг, якого пікер не знає (тоді чип показував би
 * порожнечу).
 *
 * `sport` і `beauty` у ручному пікері власних чипів не мають, тож
 * зводяться до найближчих: спорт — до «Здоровʼя», краса — до «Покупок».
 * `debt`/`charity`/`internal_transfer` осмисленого чипа не мають узагалі
 * — краще лишити дефолт, ніж вгадувати.
 */
const MCC_CATEGORY_TO_PICKER_SLUG: Readonly<Record<string, string>> = {
  food: "food",
  restaurant: "cafe",
  transport: "transport",
  subscriptions: "subscriptions",
  health: "health",
  shopping: "shopping",
  entertainment: "entertainment",
  sport: "health",
  beauty: "shopping",
  smoking: "smoking",
  alcohol: "alcohol",
  education: "education",
  travel: "travel",
};

/** Те саме для доходів: `INCOME_CATEGORIES` (легасі `in_*`) → чипи
 * `MANUAL_INCOME_TAXONOMY`. `in_other` і внутрішній переказ навмисно
 * відсутні — це «доказів немає». */
const INCOME_CATEGORY_TO_PICKER_SLUG: Readonly<Record<string, string>> = {
  in_salary: "salary",
  in_freelance: "freelance",
  in_cashback: "refund",
  in_pension: "other-income",
};

interface BankCategoryRule {
  /** Досить ОДНОГО збігу підрядком у нормалізованій назві категорії. */
  fragments: readonly string[];
  slug: string;
}

/**
 * Назва категорії банку → чип пікера. Порядок значущий: перший збіг
 * виграє, тож вужчі правила стоять раніше за ширші.
 *
 * Звірено з живим Privat24-XLSX 2026-08-25 (реальні назви: «Супермаркети
 * та продукти», «Аптеки», «Дім та ремонт», «Цифрові товари», «Ресторани,
 * кафе, бари», «Одяг та взуття», «Таксі», «Платежі за реквізитами»,
 * «Зарахування переказу», «Зарахування зі своєї картки», «Інше»). Решта
 * фрагментів — типові назви того ж кабінету, які в цьому конкретному
 * файлі не траплялись; вони нічого не ламають, бо збіг вимагає точного
 * підрядка.
 */
const BANK_CATEGORY_RULES: readonly BankCategoryRule[] = [
  // ── Витрати ────────────────────────────────────────────────────────
  { fragments: ["супермаркет", "продукт", "їжа", "бакалі"], slug: "food" },
  { fragments: ["ресторан", "кафе", "фастфуд", "їдальн"], slug: "cafe" },
  {
    fragments: ["таксі", "транспорт", "азс", "паливо", "заправ", "проїзд"],
    slug: "transport",
  },
  {
    fragments: ["аптек", "медиц", "лікар", "здоров", "стоматолог"],
    slug: "health",
  },
  { fragments: ["спорт", "фітнес"], slug: "health" },
  {
    fragments: ["одяг", "взуття", "покупк", "магазин", "маркетплейс"],
    slug: "shopping",
  },
  {
    fragments: ["дім та ремонт", "ремонт", "меблі", "побутов", "госпо"],
    slug: "shopping",
  },
  { fragments: ["краса", "салон", "перукар", "косметик"], slug: "shopping" },
  { fragments: ["зоо", "тварин"], slug: "shopping" },
  // «Цифрові товари» у Privat24 — це App Store / Google Play / стрімінг і
  // разові покупки в них. Домінує підписна модель, тому «Підписки»; якщо
  // живі дані покажуть інше, міняти тут ОДИН рядок.
  { fragments: ["цифров", "підписк", "стрімінг"], slug: "subscriptions" },
  {
    fragments: [
      "звʼязок",
      "звязок",
      "мобільн",
      "інтернет",
      "комуналь",
      "комунальн",
    ],
    slug: "utilities",
  },
  { fragments: ["техн", "електрон", "гаджет"], slug: "tech" },
  { fragments: ["розваг", "кіно", "театр", "ігри"], slug: "entertainment" },
  { fragments: ["навчанн", "освіт", "курс", "книг"], slug: "education" },
  {
    fragments: ["подорож", "готел", "квитк", "авіа", "туризм"],
    slug: "travel",
  },
  { fragments: ["алкогол"], slug: "alcohol" },
  { fragments: ["тютюн", "цигарк"], slug: "smoking" },
  // ── Надходження ────────────────────────────────────────────────────
  { fragments: ["зарплат", "заробітн", "аванс"], slug: "salary" },
  { fragments: ["фріланс", "гонорар"], slug: "freelance" },
  {
    fragments: ["кешбек", "кешбък", "повернення", "відшкодув"],
    slug: "refund",
  },
  { fragments: ["подарунок"], slug: "gift" },
];

/** Чипи витрат і доходів — окремі набори, і підказка не має права
 * підсунути витратний слаг у рядок доходу (чип просто не намалюється). */
const INCOME_SLUGS: ReadonlySet<string> = new Set([
  "salary",
  "freelance",
  "gift",
  "refund",
  "other-income",
]);

function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Назва категорії банку → слаг пікера, або `null`. */
export function mapBankCategory(
  raw: string,
  direction: ImportDirection,
): string | null {
  const value = normalize(raw);
  if (!value) return null;
  for (const rule of BANK_CATEGORY_RULES) {
    if (!rule.fragments.some((f) => value.includes(f))) continue;
    // Витратне правило в рядку доходу (і навпаки) — не збіг, а шум.
    return INCOME_SLUGS.has(rule.slug) === (direction === "income")
      ? rule.slug
      : null;
  }
  return null;
}

/** Значення MCC-колонки (рядком, як воно прийшло з файлу) → слаг. */
export function mapMccCell(raw: string): string | null {
  const mcc = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(mcc) || mcc <= 0) return null;
  const catId = categorizeMcc(mcc);
  return catId ? (MCC_CATEGORY_TO_PICKER_SLUG[catId] ?? null) : null;
}

/** Опис операції (назва мерчанта) → слаг за ключовими словами домену. */
export function mapDescription(
  description: string,
  direction: ImportDirection,
): string | null {
  const desc = description.trim();
  if (!desc) return null;
  if (direction === "income") {
    const id = getIncomeCategory(desc).id;
    return INCOME_CATEGORY_TO_PICKER_SLUG[id] ?? null;
  }
  const id = getCategory(desc, 0).id;
  return MCC_CATEGORY_TO_PICKER_SLUG[id] ?? null;
}

export interface CategoryHintInput {
  direction: ImportDirection;
  /** Значення колонки категорії банку, якщо профіль її знає. */
  bankCategory?: string | undefined;
  /** Значення MCC-колонки, якщо профіль її знає. */
  mcc?: string | undefined;
  description?: string | undefined;
}

/**
 * Три шари доказів по черзі; `null`, якщо жоден не спрацював (клієнт
 * лишає власний дефолт).
 */
export function resolveCategoryHint(input: CategoryHintInput): string | null {
  const { direction } = input;
  if (input.bankCategory) {
    const fromBank = mapBankCategory(input.bankCategory, direction);
    if (fromBank) return fromBank;
  }
  if (input.mcc && direction === "expense") {
    const fromMcc = mapMccCell(input.mcc);
    if (fromMcc) return fromMcc;
  }
  if (input.description) {
    const fromDesc = mapDescription(input.description, direction);
    if (fromDesc) return fromDesc;
  }
  return null;
}
