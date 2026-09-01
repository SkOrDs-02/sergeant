import { GENERIC_FOODS } from "@sergeant/shared/data/genericFoods";

export interface FoodCategory {
  id: string;
  label: string;
  /**
   * Імʼя гліфа дизайн-системи. До 2026-08-21 тут стояло емодзі
   * (`"🥕"`, `"🍎"`, …) — див. `mealTypes.ts` про причину заміни.
   */
  iconName: string;
  keywords: readonly string[];
  /**
   * Чи згортати назву з чека до родової (`genericFoodName`).
   *
   * Вимкнено там, де бренд змінює суть продукту: Red Bull це не Burn, а
   * «Кола Zero» не «Кола». У решті категорій бренд — шум, який плодить
   * дублі позицій.
   */
  collapseBrand: boolean;
}

export interface GroupedCategoryBucket<T = unknown> {
  cat: { id: string; label: string; iconName: string };
  items: Array<{ item: T; idx: number }>;
}

/**
 * AI-DANGER: ПОРЯДОК масиву — значуща частина поведінки, не косметика.
 * Це арбітр ФОЛБЕКУ за ключовими словами (перший збіг виграє), тож
 * перестановка записів мовчки перекидає між категоріями ті назви, яких
 * немає в кураторському корпусі. Порядок покритий тестом
 * (`foodCategories.test.ts` § «порядок каталогу»).
 *
 * Чому саме такий порядок — залежності з реальних чеків:
 *  - `sweets_snacks` перед `drinks`: «шоколад» містить підрядок «кола»;
 *  - `ready_meals` перед `sauces`: страва в голові назви виграє соус у
 *    хвості — «Удон з куркою в соусі терияки» це удон;
 *  - `sauces` перед `nuts_seeds`: «Паста арахісова» — соус, не горіхи;
 *  - `nuts_seeds` перед `vegetables`: «Насіння Roni гарбуза» — не овоч;
 *  - `ready_meals` перед `meat`: «Котлети курячі» — готова страва;
 *  - `fruits` перед `alcohol`: корінь «вино» стоїть на початку «виноград»,
 *    і межа слова тут не рятує — рятує лише порядок;
 *  - `fish` перед `meat`: «філе» належить мʼясу, тож «Філе лосося» без
 *    цього порядку поїхало б у мʼясо.
 */
export const FOOD_CATEGORIES: readonly FoodCategory[] = [
  {
    id: "sweets_snacks",
    label: "Солодощі та снеки",
    iconName: "sparkle",
    collapseBrand: false,
    keywords: [
      "цукерк",
      "шоколад",
      "печив",
      "вафл",
      "морозиво",
      "чіпс",
      // Сільпо друкує «Чипси» через «и», тож саме це написання й треба
      // ловити: назва в чеку не проходить нашу орфографію.
      "чипс",
      "грінк",
      "сухарик",
      "снек",
      "крекер",
      "мармелад",
      "зефір",
      "халва",
      "батончик",
      "тістечк",
      "жуйк",
      // Чек пише жуйку описово: «Гумка жувальна Dirol кавунно-динний».
      // Без цих двох вона їхала у фрукти на слові «кавунно».
      "жувальн",
      "гумка",
      "попкорн",
    ],
  },
  {
    id: "drinks",
    label: "Напої та вода",
    iconName: "coffee",
    collapseBrand: false,
    keywords: [
      "напій",
      "вода",
      "сік",
      "кола",
      "лимонад",
      "кава",
      "кави",
      "чай",
      "енергетик",
      "мінеральн",
      "смузі",
      "компот",
      "узвар",
      "какао",
      "лате",
      "капучіно",
      "американо",
    ],
  },
  {
    id: "ready_meals",
    label: "Готова кулінарія",
    iconName: "utensils",
    collapseBrand: true,
    keywords: [
      "котлет",
      "готов",
      "кулінар",
      // Словник вітрини готової їжі. Без нього страва впізнавалась за
      // інгредієнтом, а не за формою: «Салат з баликом та маринованими
      // огірками» їхав у Консерви на корені «маринован», «Курячий шашлик
      // з ананасом» і «Сосиска в здобному тісті» — у Мʼясо, а будь-який
      // салат із вітрини, якого нема в корпусі, — в Овочі (звіт власника
      // 2026-09-01). Форма страви має вигравати її начинку.
      //
      // `салат` тут, а НЕ в овочах: листковий салат це сорт зелені, і всі
      // його різновиди лежать у корпусі («Салат листовий», «Салат
      // айсберг»), тож корпус віддає їх в Овочі раніше, ніж дійде до
      // ключових слів. Усе інше зі словом «салат» це страва.
      "салат",
      "шашлик",
      // Локатив, а не називний: «у тісті» це готова випічка, тоді як
      // «Тісто листкове» це напівфабрикат і має лишатись де було.
      "тісті",
      "суші",
      "рол",
      "онігірі",
      "удон",
      "піц",
      "сендвіч",
      "шаурм",
      "бургер",
      "вареник",
      "пельмен",
      "голубц",
      "млинц",
      "деруни",
      "борщ",
      "солянк",
      "розсольник",
      "окрошк",
      "холодник",
      "сирник",
      "галушк",
      "налисник",
      "лазань",
      "вінегрет",
      "олівʼє",
    ],
  },
  {
    id: "sauces",
    label: "Соуси та пасти",
    iconName: "bottle",
    collapseBrand: true,
    keywords: [
      "соус",
      "кетчуп",
      "майонез",
      "гірчиц",
      "паста",
      "песто",
      "хумус",
      "аджик",
      "тахін",
      "сальс",
      "теріякі",
      "терияки",
      "ткемалі",
      "маргарин",
    ],
  },
  {
    id: "nuts_seeds",
    label: "Горіхи та насіння",
    iconName: "leaf",
    collapseBrand: true,
    keywords: [
      "насіння",
      "горіх",
      "мигдал",
      "кешʼю",
      "кешью",
      "фісташ",
      "арахіс",
      "фундук",
      "кедров",
      "чіа",
      "кунжут",
    ],
  },
  {
    id: "canned",
    label: "Консерви",
    iconName: "archive",
    collapseBrand: true,
    keywords: [
      "консерв",
      "тушонк",
      "шпрот",
      "маринован",
      "квашен",
      "оливки",
      "маслини",
      "паштет",
      "корнішон",
      "каперс",
    ],
  },
  {
    id: "frozen",
    label: "Заморожене",
    iconName: "snowflake",
    collapseBrand: true,
    keywords: ["заморож", "морожен", "с/м"],
  },
  {
    id: "vegetables",
    label: "Овочі",
    iconName: "carrot",
    collapseBrand: true,
    keywords: [
      "огірок",
      "огірк",
      "помідор",
      "томат",
      "морква",
      "цибул",
      "часник",
      "картопл",
      "капуст",
      "перец",
      "перц",
      "буряк",
      "кабачок",
      "кабачк",
      "баклажан",
      "броколі",
      "шпинат",
      "редис",
      "гарбуз",
      "зелен",
      "кукурудз",
      "чері",
      "печериц",
      "спаржа",
      "селера",
      "петрушк",
      "кріп",
      "руккол",
      "батат",
    ],
  },
  {
    id: "legumes",
    label: "Бобові",
    iconName: "bean",
    collapseBrand: true,
    keywords: [
      "квасол",
      "сочевиц",
      "горошок",
      "тофу",
      "едамаме",
      "бобов",
      "маш",
    ],
  },
  {
    id: "fruits",
    label: "Фрукти та ягоди",
    iconName: "apple",
    collapseBrand: true,
    keywords: [
      "яблук",
      "груш",
      "банан",
      "апельсин",
      "мандарин",
      "лимон",
      "грейпфрут",
      "ківі",
      "виноград",
      "персик",
      "абрикос",
      "слив",
      "полуниц",
      "чорниц",
      "лохин",
      "малин",
      "смородин",
      "журавлин",
      "ананас",
      "диня",
      "кавун",
      "авокадо",
      "манго",
      "черешн",
      "вишн",
      "хурма",
      "гранат",
      "інжир",
      "кокос",
      "курага",
      "чорнослив",
      "родзинк",
      "фінік",
    ],
  },
  {
    id: "alcohol",
    label: "Алкоголь",
    iconName: "wine",
    // Конкретне вино — це конкретний товар, а не «вино взагалі»: згорнувши
    // бренд, ми злили б у купу речі, які людина розрізняє.
    collapseBrand: false,
    keywords: [
      "пиво",
      "вино",
      "горілк",
      "віскі",
      "коньяк",
      "шампанськ",
      "лікер",
      "сидр",
      "вермут",
      "текіл",
      "бренді",
      "портвейн",
      // Наливка і настоянка називаються по ягоді («Наливка вишнева»,
      // «Настоянка на журавлині»). Самих цих коренів НЕ досить: фрукти
      // стоять у каталозі раніше, тож `вишн` спрацьовує перший і назва їде
      // у фрукти. Підняти алкоголь вище не можна — тоді «виноград» поїде
      // сюди за коренем `вино` (гейт «порядок каталогу»). Кейс лікує
      // позиційне ранжування keyword-шару: тут `наливк` стоїть у назві
      // першим. Корені лежать тут як передумова тієї зміни.
      "наливк",
      "настоянк",
    ],
  },
  {
    id: "fish",
    label: "Риба та морепродукти",
    iconName: "fish",
    collapseBrand: true,
    keywords: [
      "риб",
      "лосос",
      "сьомг",
      "тунец",
      "тунць",
      "тунця",
      "форел",
      "оселедц",
      "оселедец",
      "скумбрі",
      "тріск",
      "минтай",
      "горбуш",
      "тілапі",
      "судак",
      "креветк",
      "кальмар",
      "мідії",
      "устриц",
      "восьміног",
      "морепродукт",
      "сардин",
      "ікра",
      "хек",
      "сом",
    ],
  },
  {
    id: "meat",
    label: "Мʼясо та птиця",
    iconName: "drumstick",
    collapseBrand: true,
    keywords: [
      // Родова назва категорії має впізнаватись не гірше за конкретний
      // продукт: без цього кореня саме слово «мʼясо» падало в «Інше»,
      // хоча «Куряча грудка» лягала правильно. Апостроф до звірки
      // прибирається, тож корінь пишеться без нього.
      "мяс",
      "курк",
      "курч",
      "курин",
      "куряч",
      "індик",
      "індич",
      "свинин",
      "яловичин",
      "телятин",
      "баранин",
      "кролик",
      "качка",
      "гусятин",
      "фарш",
      "ковбас",
      "сосиск",
      "шинк",
      "бекон",
      "саламі",
      "пепероні",
      "хамон",
      "бастурма",
      "сал",
      "філе",
      "стейк",
      "грудк",
      "печінк",
      "шашлик",
      "нагетс",
    ],
  },
  {
    id: "dairy_eggs",
    label: "Молочні та яйця",
    iconName: "egg",
    collapseBrand: true,
    keywords: [
      "молок",
      "кефір",
      "сметан",
      "йогурт",
      "сир",
      "творог",
      "масл",
      "вершк",
      "ряжанк",
      "яйц",
      "яєць",
      "яєчн",
      "омлет",
      "фета",
      "моцарел",
      "пармезан",
      "маскарпоне",
    ],
  },
  {
    id: "grains",
    label: "Крупи та хліб",
    iconName: "wheat",
    collapseBrand: true,
    keywords: [
      "рис",
      "гречк",
      "вівсян",
      "овес",
      "кукурудз",
      "пшон",
      "манк",
      "макарон",
      "спагет",
      "хліб",
      "батон",
      "багет",
      "чіабат",
      "круасан",
      "маффін",
      "пончик",
      "еклер",
      "булочк",
      "лаваш",
      "борошн",
      "мук",
      "киноа",
      "кіноа",
      "булгур",
      "перловк",
      "пластівц",
      "мюслі",
      "гранол",
      "тортил",
      "кус-кус",
      "амарант",
      "полента",
    ],
  },
  {
    id: "sports",
    label: "Спортивне харчування",
    iconName: "dumbbell",
    // Конкретний протеїн — конкретний товар: смак і бренд тут і є вибором.
    collapseBrand: false,
    keywords: [
      "протеїн",
      "казеїн",
      "гейнер",
      "bcaa",
      "креатин",
      "ізотонік",
      "амінокислот",
      "карнітин",
      "сироватков",
    ],
  },
  {
    id: "pantry",
    label: "Олії, спеції та бакалія",
    iconName: "droplet",
    collapseBrand: true,
    keywords: [
      "олі",
      "олія",
      "оливков",
      "оцет",
      "сіль",
      "сол",
      "цукор",
      "цукр",
      "мед",
      "спец",
      "перець мелен",
      "перц",
      "кориц",
      "ванілін",
      "сод",
      "розпушувач",
    ],
  },
];

const OTHER: FoodCategory = {
  id: "other",
  label: "Інше",
  iconName: "package",
  keywords: [],
  // Останній фолбек: якщо ми не впізнали продукт, то не впізнали й того,
  // що в його назві бренд, а що суть. Не чіпаємо назву взагалі.
  collapseBrand: false,
};

/**
 * Категорія кураторського корпусу → id категорії комори.
 *
 * AI-CONTEXT: корпус (`GENERIC_FOODS`) групується за товарним видом і має
 * власну, СТАРШУ таксономію — вона живе в `generic_foods` і у видачі
 * пошуку. Комора показує свій каталог. Тому це два різні списки, звʼязані
 * ось цією мапою, а не одне поле в двох місцях: злиття зафіксувало б
 * серверну видачу за UI комори і навпаки.
 *
 * Алкоголь відділяється НЕ мапою, а полем `alcohol_g` — воно вже є в
 * корпусі заради воріт Атвотера, тож окремий список назв був би другим
 * джерелом правди для того самого факту.
 */
export const CORPUS_CATEGORY_TO_ID: Readonly<Record<string, string>> = {
  Бобові: "legumes",
  "Горіхи і насіння": "nuts_seeds",
  "Готові страви": "ready_meals",
  Заморожене: "frozen",
  Консерви: "canned",
  "Крупи і злаки": "grains",
  "Молочні продукти": "dairy_eggs",
  Напої: "drinks",
  "Мʼясо і птиця": "meat",
  "Овочі і гриби": "vegetables",
  "Олії і жири": "pantry",
  "Риба і морепродукти": "fish",
  Салати: "ready_meals",
  Солодощі: "sweets_snacks",
  "Соуси і спеції": "sauces",
  "Спортивне харчування": "sports",
  "Українська кухня": "ready_meals",
  "Фрукти і ягоди": "fruits",
  "Хліб і випічка": "grains",
  Яйця: "dairy_eggs",
};

const BY_ID = new Map(FOOD_CATEGORIES.map((c) => [c.id, c]));

/**
 * Хвіст «зі смаком …» / «з ароматом …» несе слова чужих категорій:
 * «Чипси креветкові зі смаком **соусу** чилі». Голова назви — це продукт,
 * хвіст — маркетинг, тож хвіст відрізається до будь-якого зіставлення.
 */
const FLAVOUR_TAIL = /\s(?:зі|зi|із|iз|з)\s+(?:смаком|ароматом)[\s\S]*$/u;

// Службові слова, які нічого не кажуть про продукт, але мають ≥3 літери й
// інакше давали б збіг («Молоко **без** лактози» ↔ «Кава (**без** цукру)»).
const STOPWORDS = new Set([
  "без",
  "для",
  "під",
  "при",
  "або",
  "над",
  "від",
  "про",
  "між",
]);

function splitTokens(name: string): string[] {
  return (
    name
      .toLowerCase()
      // Варіанти апострофа зникають, а не стають межею слова: інакше
      // «мʼясом» розпалось би на «м» + «ясом».
      .replace(/[ʼ’'`]/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
  );
}

function indexTokens(name: string): string[] {
  return [
    ...new Set(
      splitTokens(name).filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    ),
  ];
}

interface CorpusEntry {
  tokens: readonly string[];
  catId: string;
}

let corpusIndex: CorpusEntry[] | null = null;

function getCorpusIndex(): CorpusEntry[] {
  if (corpusIndex) return corpusIndex;
  const built: CorpusEntry[] = [];
  for (const food of GENERIC_FOODS) {
    const catId =
      food.alcohol_g != null ? "alcohol" : CORPUS_CATEGORY_TO_ID[food.category];
    if (!catId) continue;
    const tokens = indexTokens(food.name);
    if (tokens.length > 0) built.push({ tokens, catId });
    for (const alias of food.aliases ?? []) {
      const aliasTokens = indexTokens(alias);
      if (aliasTokens.length > 0) built.push({ tokens: aliasTokens, catId });
    }
  }
  corpusIndex = built;
  return built;
}

/**
 * Кандидат приймається лише коли збіглося ≥2 слів АБО коли він збігся
 * ЦІЛКОМ. Одне слово з довшої назви — це не впізнавання, а випадковість:
 * «Котлети курячі з кускусом» інакше чіплялись за «Шлунки курячі» і
 * їхали в мʼясо замість готової кулінарії, а «Філе лосося» — за «Філе
 * індички». Однослівна позиція, збігшись уся («Мед», «Хек»), проходить —
 * там нема чому бути хибним.
 *
 * Ранжування: спершу той, чий збіг починається РАНІШЕ в назві, і лише
 * потім найдовший (§3 спеки). Голова назви — це продукт, хвіст — смак і
 * бренд; «Йогурт Галичина Карпатський чорниця» інакше виграє «Чорниця»
 * (7 літер) над синонімом «йогурт» (6) і їде у фрукти. Найдовший збіг
 * лишається арбітром у межах однієї позиції: «Салат з тунцем» так само
 * виграє в однослівного «Салат листовий».
 */
function matchCorpus(orderedTokens: readonly string[]): string | null {
  const positions = new Map<string, number>();
  orderedTokens.forEach((t, i) => {
    if (!positions.has(t)) positions.set(t, i);
  });

  let bestPos = Number.POSITIVE_INFINITY;
  let bestScore = 0;
  let bestUnmatched = Number.POSITIVE_INFINITY;
  let bestId: string | null = null;

  for (const entry of getCorpusIndex()) {
    let score = 0;
    let matched = 0;
    let pos = Number.POSITIVE_INFINITY;
    for (const token of entry.tokens) {
      const at = positions.get(token);
      if (at === undefined) continue;
      score += token.length;
      matched += 1;
      if (at < pos) pos = at;
    }
    if (matched === 0) continue;
    const unmatched = entry.tokens.length - matched;
    if (matched < 2 && unmatched > 0) continue;
    const better =
      pos < bestPos ||
      (pos === bestPos &&
        (score > bestScore ||
          (score === bestScore && unmatched < bestUnmatched)));
    if (better) {
      bestPos = pos;
      bestScore = score;
      bestUnmatched = unmatched;
      bestId = entry.catId;
    }
  }
  return bestId;
}

/**
 * Корінь коротший за 5 літер матчиться лише з ПОЧАТКУ токена: інакше
 * «г**риб**и» їхали в рибу, а «рук**кола**» — у напої. Довгі корені
 * лишаються підрядком будь-де — саме на цьому тримається впізнавання
 * словоформ («яблук» у «яблука»).
 *
 * Виняток — корені з не-літерами («с/м»): токенізатор їх розриває, тож
 * межа слова для них не визначена.
 */
function keywordHit(
  lowered: string,
  tokens: readonly string[],
  keyword: string,
): boolean {
  if (keyword.length >= 5 || !/^\p{L}+$/u.test(keyword)) {
    return lowered.includes(keyword);
  }
  return tokens.some((t) => t.startsWith(keyword));
}

/**
 * Каскад: кураторський корпус → ключові слова.
 *
 * Корпус перший, бо в ньому категорія проставлена людиною, а ключові
 * слова лише вгадують. Ключові слова лишаються для брендових назв із
 * чека, яких у корпусі немає й ніколи не буде.
 */
export function categorizeFood(name: unknown): FoodCategory {
  const raw = String(name || "")
    .toLowerCase()
    .trim();
  if (!raw) return OTHER;

  const head = raw.replace(FLAVOUR_TAIL, "").trim() || raw;

  const fromCorpus = matchCorpus(indexTokens(head));
  if (fromCorpus) return BY_ID.get(fromCorpus) ?? OTHER;

  const tokens = splitTokens(head);
  for (const cat of FOOD_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (keywordHit(head, tokens, kw)) return cat;
    }
  }
  return OTHER;
}

export function groupItemsByCategory<T extends { name?: unknown }>(
  items: readonly T[] | unknown,
): Array<GroupedCategoryBucket<T>> {
  const buckets = new Map<string, GroupedCategoryBucket<T>>();
  for (const cat of FOOD_CATEGORIES) buckets.set(cat.id, { cat, items: [] });
  buckets.set(OTHER.id, { cat: OTHER, items: [] });

  const arr = (Array.isArray(items) ? items : []) as readonly T[];
  arr.forEach((it, idx) => {
    const cat = categorizeFood(it?.name);
    buckets.get(cat.id)?.items.push({ item: it, idx });
  });

  return [...buckets.values()].filter((b) => b.items.length > 0);
}
