import { categorizeMcc } from "../../mono/mccCategories.js";
import {
  getCategory,
  getIncomeCategory,
} from "@sergeant/finyk-domain/lib/categories";
import { MANUAL_INCOME_TAXONOMY } from "@sergeant/finyk-domain/lib/manualTaxonomy";
import {
  INTERNAL_TRANSFER_ID,
  P2P_TRANSFER_MCCS,
} from "@sergeant/finyk-domain/constants";
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
 * `internal_transfer` чип ТЕПЕР МАЄ — окремим пунктом пікера імпорту в
 * обох напрямах (`BulkReviewTable.tsx`), доданим 2026-09-13 разом із цією
 * підказкою; доти розмітити рух між власними кишенями у виписці не було
 * чим узагалі. `debt` чип МАЄ («Борги та кредити», id `debt` —
 * `packages/finyk-domain/src/lib/manualTaxonomy.ts:174-179`) і тепер
 * замаплений — виправлено 2026-09-11 разом із фіксом категоризації
 * щомісячного погашення кредитки (звіт власника: платіж по кредитці
 * летів в «Інше»). `charity` чип теж має, але лишається немапленим тут
 * свідомо не через цю правку — окремий випадок, не зачеплений фіксом.
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
  debt: "debt",
  // П'ять категорій 2026-10-01: усі вони є чипами ручного пікера під тим
  // самим id, тож міст прямий. `p2p_transfer` тут лише на випадок, якщо
  // каталог колись почне його повертати з MCC (зараз ні: код 4829 читає
  // клієнтський резолвер, див. `P2P_TRANSFER_MCCS`).
  telecom: "telecom",
  home: "home",
  pets: "pets",
  gifts: "gifts",
  p2p_transfer: "p2p_transfer",
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
  // «Дім та ремонт» — реальна назва категорії з живого Privat24-XLSX; з
  // 2026-10-01 їй є куди лягти (`home`), доти — у «Покупки». «Побутов»
  // (побутова техніка) лишається покупками і стоїть РАНІШЕ: це не ремонт і
  // не меблі, а перший збіг у списку вирішує все.
  { fragments: ["побутов"], slug: "shopping" },
  { fragments: ["дім та ремонт", "ремонт", "меблі", "госпо"], slug: "home" },
  { fragments: ["краса", "салон", "перукар", "косметик"], slug: "shopping" },
  { fragments: ["зоо", "тварин"], slug: "pets" },
  // Множина: «подарунок» (однина) — це НАДХОДЖЕННЯ (`gift`, правило
  // нижче), і перший збіг у списку вирішує все, тож однина тут повернула б
  // null замість доходу.
  { fragments: ["подарунки", "квіти"], slug: "gifts" },
  // «Цифрові товари» у Privat24 — це App Store / Google Play / стрімінг і
  // разові покупки в них. Домінує підписна модель, тому «Підписки»; якщо
  // живі дані покажуть інше, міняти тут ОДИН рядок.
  { fragments: ["цифров", "підписк", "стрімінг"], slug: "subscriptions" },
  { fragments: ["звʼязок", "звязок", "мобільн", "інтернет"], slug: "telecom" },
  { fragments: ["комуналь", "комунальн"], slug: "utilities" },
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
  { fragments: ["кешбек", "кешбък"], slug: "cashback" },
  { fragments: ["повернення", "відшкодув"], slug: "refund" },
  { fragments: ["подарунок"], slug: "gift" },
];

/** Чипи витрат і доходів — окремі набори, і підказка не має права
 * підсунути витратний слаг у рядок доходу (чип просто не намалюється). */
const INCOME_SLUGS: ReadonlySet<string> = new Set(
  MANUAL_INCOME_TAXONOMY.map((category) => category.id),
);

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

/**
 * Зняття готівки: 6011 (банкомат) і 6010 (каса банку).
 *
 * У `MCC_CATEGORIES` вони свідомо НЕ належать жодній витратній категорії
 * (`constants.ts` § «6010/6011 СВІДОМО не тут»), тож `categorizeMcc` на них
 * мовчить і рядок їхав у дефолтне «Інше» — тобто рахувався витратою в той
 * самий момент, коли гроші ще лежали в кишені.
 *
 * Підказка тут — саме підказка: `resolveCategoryHint` нічого не пише, рядок
 * проходить обовʼязковий bulk-review, і людина знімає чип одним тапом. Це
 * рівно та «видима overrideable підказка», яку описує ADR-0076.
 *
 * **Межа, про яку треба памʼятати.** Поки «Готівки на руках» (ADR-0076) у
 * коді немає, позначений переказом рядок виходить із підсумків — і готівкова
 * витрата існує лише тоді, коли людина внесе її сама. Тобто підказка міняє
 * бік похибки: замість подвійного обліку (зняття + ручна витрата) отримуємо
 * недооблік, якщо готівку не заносити. Закриє це лише ADR-0076.
 */
const CASH_WITHDRAWAL_MCCS: ReadonlySet<number> = new Set([6010, 6011]);

/** Значення MCC-колонки (рядком, як воно прийшло з файлу) → слаг. */
export function mapMccCell(raw: string): string | null {
  const mcc = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(mcc) || mcc <= 0) return null;
  if (CASH_WITHDRAWAL_MCCS.has(mcc)) return INTERNAL_TRANSFER_ID;
  const catId = categorizeMcc(mcc);
  return catId ? (MCC_CATEGORY_TO_PICKER_SLUG[catId] ?? null) : null;
}

/**
 * Опис зняття готівки — той самий випадок, що `CASH_WITHDRAWAL_MCCS`, але
 * для файлів БЕЗ колонки MCC (а це більшість: у живому Privat24-XLSX
 * 2026-08-25 MCC немає). Формулювання з реальних виписок: «Зняття готівки в
 * банкоматі», «Видача готівки», «Отримання готівки».
 *
 * Вужче за `getCategory`: перевіряється до нього, бо каталог мерчантів на
 * ці описи не реагує взагалі й віддає «Інше».
 */
const CASH_WITHDRAWAL_FRAGMENTS: readonly string[] = [
  "зняття готівки",
  "видача готівки",
  "отримання готівки",
  "зняття коштів",
  "банкомат",
  "atm",
  "cash withdrawal",
];

/**
 * Опис операції (назва мерчанта) → слаг за ключовими словами домену.
 *
 * `p2pMcc` — код переказу (4829) з MCC-колонки, якщо він там був. Каталог
 * `categorizeMcc` його не знає навмисно (див. `P2P_TRANSFER_MCCS`), тож
 * передаємо сюди й питаємо канонічний `getCategory`, який уміє ВІДРІЗНИТИ
 * переказ людині від поповнення банки: той самий резолвер, що в стрічці, а
 * не друга копія правила.
 */
export function mapDescription(
  description: string,
  direction: ImportDirection,
  p2pMcc = 0,
): string | null {
  const desc = description.trim();
  if (!desc) return null;
  if (direction === "income") {
    const normalized = normalize(desc);
    if (["повернення", "відшкодув"].some((word) => normalized.includes(word)))
      return "refund";
    const id = getIncomeCategory(desc).id;
    return id !== "other-income" && INCOME_SLUGS.has(id) ? id : null;
  }
  const normalized = normalize(desc);
  if (CASH_WITHDRAWAL_FRAGMENTS.some((f) => normalized.includes(f))) {
    return INTERNAL_TRANSFER_ID;
  }
  const id = getCategory(desc, p2pMcc).id;
  return MCC_CATEGORY_TO_PICKER_SLUG[id] ?? null;
}

/** MCC-клітинка → код, ЛИШЕ якщо це код переказу людям; інакше 0. */
function p2pMccOf(raw: string | undefined): number {
  const mcc = Number.parseInt((raw ?? "").trim(), 10);
  return P2P_TRANSFER_MCCS.includes(mcc) ? mcc : 0;
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
    const fromDesc = mapDescription(
      input.description,
      direction,
      direction === "expense" ? p2pMccOf(input.mcc) : 0,
    );
    if (fromDesc) return fromDesc;
  }
  return null;
}
