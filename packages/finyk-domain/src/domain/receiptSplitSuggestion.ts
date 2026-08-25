/**
 * Детермінований мапер «позиції чека Сільпо → пропозиція спліту» (спека
 * silpo-mcp-integration, § Рішення дизайну: «Спліт — пропозиція, не
 * мовчазний запис»).
 *
 * Правила:
 *  - мапимо в ІСНУЮЧУ таксономію finyk (`manualTaxonomy`): `groceries`
 *    (канон `food`), `health`, `shopping` — інших супермаркетних кошиків
 *    у таксономії немає; алкоголь свідомо лишається в `groceries`
 *    (окремої категорії не існує; заводити нову — продуктове рішення
 *    поза цим мапером);
 *  - спершу дивимось на `categorySlug` з чека (дерево категорій Сільпо —
 *    ПРОВІЗІЙНЕ до спайку §0), потім на ключові слова в назві позиції;
 *  - нічого не вгадали → `groceries`: у супермаркеті це чесний дефолт і
 *    поточна поведінка без інтеграції (вся транзакція = food);
 *  - суми — копійки як цілі числа; жодних float-грн усередині.
 *
 * Чиста функція без I/O. AI-класифікатор «іншого» — прискорювач пізніше,
 * поза цим модулем (спека § Ризики).
 */

export interface ReceiptItemForSplit {
  name: string;
  /** `category_slug` з silpo_receipt_items, якщо MCP його віддав. */
  categorySlug?: string | null | undefined;
  priceKop: number;
  qty?: number | null | undefined;
}

export interface SuggestedSplit {
  categoryId: string;
  amountKop: number;
  itemCount: number;
}

export interface ReceiptSplitSuggestion {
  /** Відсортовано за сумою (спадання). */
  splits: SuggestedSplit[];
  /** true, коли всі позиції лягли в одну категорію — спліт не потрібен. */
  singleCategory: boolean;
  totalKop: number;
}

/** Слаги Сільпо (провізійні до спайку §0) → категорія finyk. */
const SLUG_PREFIX_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(hygiene|cosmetic|beauty|apteka|pharma|medic|zdorov)/i, "health"],
  [
    /^(household|chemistry|pobut|hospodar|cleaning|dim|home|zoo|pet)/i,
    "shopping",
  ],
];

/**
 * Ключові слова в назвах позицій. Порядок важливий: перший збіг виграє,
 * специфічніші класи (аптека/гігієна) стоять перед побутовою хімією.
 */
const NAME_KEYWORD_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /(зубн|шампун|гел[ьл]\s*для\s*душ|дезодорант|прокладк|тампон|підгузк|памперс|бритв|лез[ао]|вітамін|парацетамол|ібупрофен|пластир|бинт|антисепт|серветк.*вологі|крем\s*для\s*(рук|обличч|тіла|ніг|голінн|гоління|шкір))/iu,
    "health",
  ],
  [
    /(порош(ок|ку)\s*праль|праль|засіб\s*для\s*(миття|прання|чищення)|мийн|відбілювач|кондиціонер\s*для\s*білизн|туалетн(ий|ого)\s*папір|папір\s*туалетн|рушник\s*паперов|фольг|пергамент|пакет[иі]?\s*(для\s*сміття|фасув)|сміттєв|губк[аи]|ганчірк|батарейк|лампочк|свічк|корм\s*для|наповнювач\s*для)/iu,
    "shopping",
  ],
];

/** Мапить одну позицію чека в категорію finyk (`groceries` за замовчуванням). */
export function mapReceiptItemToCategory(item: ReceiptItemForSplit): string {
  const slug = item.categorySlug?.trim();
  if (slug) {
    for (const [re, categoryId] of SLUG_PREFIX_MAP) {
      if (re.test(slug)) return categoryId;
    }
  }
  for (const [re, categoryId] of NAME_KEYWORD_MAP) {
    if (re.test(item.name)) return categoryId;
  }
  return "groceries";
}

/**
 * Групує позиції чека у пропозицію спліту. Кількість (`qty`) НЕ множиться
 * на ціну: провізійно вважаємо `priceKop` сумою рядка (line total) — якщо
 * спайк §0 покаже, що це ціна за одиницю, множення додається тут в одному
 * місці.
 */
export function suggestSplitsFromReceiptItems(
  items: readonly ReceiptItemForSplit[],
): ReceiptSplitSuggestion {
  const byCategory = new Map<
    string,
    { amountKop: number; itemCount: number }
  >();
  let totalKop = 0;
  for (const item of items) {
    if (!Number.isFinite(item.priceKop) || item.priceKop <= 0) continue;
    const categoryId = mapReceiptItemToCategory(item);
    const acc = byCategory.get(categoryId) ?? { amountKop: 0, itemCount: 0 };
    acc.amountKop += item.priceKop;
    acc.itemCount += 1;
    byCategory.set(categoryId, acc);
    totalKop += item.priceKop;
  }
  const splits: SuggestedSplit[] = [...byCategory.entries()]
    .map(([categoryId, acc]) => ({ categoryId, ...acc }))
    .sort(
      (a, b) =>
        b.amountKop - a.amountKop || a.categoryId.localeCompare(b.categoryId),
    );
  return { splits, singleCategory: splits.length <= 1, totalKop };
}
