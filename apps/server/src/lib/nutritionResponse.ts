import { normalizeMacrosNullable, sumMacrosNullable } from "@sergeant/shared";

function safeString(x: unknown, fallback = ""): string {
  return x == null ? fallback : String(x);
}

function safeNumberOrNull(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function safeNonNegNumberOrNull(x: unknown): number | null {
  const n = safeNumberOrNull(x);
  return n == null ? null : n >= 0 ? n : null;
}

function clamp01(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export interface PhotoMacros {
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
}

export interface PhotoPortion {
  label: string | null;
  gramsApprox: number | null;
}

export interface PhotoIngredient {
  name: string;
  notes: string | null;
}

/**
 * Одна позиція кадру — страва, а не інгредієнт. Стеля 5 стоїть і в промпті,
 * і тут: промпт її просить, нормалізатор гарантує навіть коли модель просить
 * пробачення і віддає вісім.
 */
export interface PhotoItem {
  name: string;
  macros: PhotoMacros;
  gramsApprox: number | null;
  confidence: number;
}

export const PHOTO_ITEMS_LIMIT = 5;

/**
 * Категорія кадру, коли їжі на ньому немає. Рівно три значення, бо рівно три
 * різні репліки: тваринці кажемо погладити, людині — навести камеру на
 * тарілку, решті (предмет, краєвид, скріншот, порожній кадр) — нейтральне
 * «обери інше фото». Ширша таксономія була б полем, яке жоден екран не читає.
 */
export type NotFoodKind = "animal" | "person" | "other";

export interface NormalizedPhotoResult {
  /**
   * Чи є на фото їжа. `false` — це відмова: КБЖВ і питання порожні, UI не дає
   * зберегти такий результат у журнал. Див. `resolveIsFood`.
   */
  isFood: boolean;
  /**
   * Що саме в кадрі замість їжі — заповнене ТІЛЬКИ при `isFood: false`, інакше
   * `null`. Клієнти беруть із нього тон відмови; назву показує `dishName`.
   */
  notFoodKind: NotFoodKind | null;
  dishName: string;
  confidence: number;
  portion: PhotoPortion | null;
  ingredients: PhotoIngredient[];
  /**
   * Позиції кадру. При `isFood: true` тут завжди щонайменше одна: коли модель
   * не віддала масив, нормалізатор синтезує позицію з `dishName` + `macros`,
   * щоб жоден споживач не малював порожній список. При `isFood: false` —
   * порожньо, як і решта полів відмови.
   */
  items: PhotoItem[];
  /** Сума `items` — не окреме число моделі. Див. `normalizePhotoResult`. */
  macros: PhotoMacros;
  questions: string[];
}

export interface PantryItem {
  name: string;
  qty: number | null;
  unit: string | null;
  notes: string | null;
}

export type RecipeMacros = PhotoMacros;

export interface NormalizedRecipe {
  title: string;
  timeMinutes: number | null;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  tips: string[];
  macros: RecipeMacros;
}

export function normalizePhotoResult(
  parsed: unknown,
  { fallbackGrams = null }: { fallbackGrams?: number | null } = {},
): NormalizedPhotoResult {
  const obj =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const dishName =
    safeString(obj["dishName"], "Результат").trim() || "Результат";
  const confidence = clamp01(obj["confidence"]);

  const portionRaw = obj["portion"];
  const portion: PhotoPortion | null =
    portionRaw && typeof portionRaw === "object" && !Array.isArray(portionRaw)
      ? {
          label:
            safeString(
              (portionRaw as Record<string, unknown>)["label"],
              "",
            ).trim() || null,
          gramsApprox:
            (portionRaw as Record<string, unknown>)["gramsApprox"] == null
              ? null
              : safeNumberOrNull(
                  (portionRaw as Record<string, unknown>)["gramsApprox"],
                ),
        }
      : null;

  const ingredients: PhotoIngredient[] = Array.isArray(obj["ingredients"])
    ? (obj["ingredients"] as unknown[])
        .slice(0, 40)
        .map((x): PhotoIngredient | null => {
          if (!x || typeof x !== "object") return null;
          const rec = x as Record<string, unknown>;
          const name = safeString(rec["name"], "").trim();
          if (!name) return null;
          const notes =
            rec["notes"] == null || rec["notes"] === ""
              ? null
              : safeString(rec["notes"], "").trim();
          return { name, notes };
        })
        .filter((v): v is PhotoIngredient => Boolean(v))
    : [];

  const rawItems: PhotoItem[] = Array.isArray(obj["items"])
    ? (obj["items"] as unknown[])
        .slice(0, PHOTO_ITEMS_LIMIT)
        .map((x): PhotoItem | null => {
          if (!x || typeof x !== "object") return null;
          const rec = x as Record<string, unknown>;
          const name = safeString(rec["name"], "").trim();
          if (!name) return null;
          // `normalizeMacrosNullable`, а не локальний `safeNonNegNumberOrNull`:
          // останній жене `null` через `Number()`, а `Number(null)` — це `0`,
          // тож невідомий макрос позиції став би нулем ще до підсумовування.
          // Верхньорівневі `macros` живуть зі старою поведінкою під наглядом
          // `unknownMacrosAsNull`; у позицій такої страхувальної сітки немає.
          return {
            name,
            macros: normalizeMacrosNullable(rec["macros"]),
            gramsApprox:
              rec["gramsApprox"] == null
                ? null
                : safeNonNegNumberOrNull(rec["gramsApprox"]),
            confidence: clamp01(rec["confidence"]),
          };
        })
        .filter((v): v is PhotoItem => Boolean(v))
    : [];

  const macrosRaw = obj["macros"];
  const macros =
    macrosRaw && typeof macrosRaw === "object" && !Array.isArray(macrosRaw)
      ? (macrosRaw as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const outMacros: PhotoMacros = {
    kcal: safeNonNegNumberOrNull(macros["kcal"]),
    protein_g: safeNonNegNumberOrNull(macros["protein_g"]),
    fat_g: safeNonNegNumberOrNull(macros["fat_g"]),
    carbs_g: safeNonNegNumberOrNull(macros["carbs_g"]),
  };

  const questions: string[] = Array.isArray(obj["questions"])
    ? (obj["questions"] as unknown[])
        .map((q) => safeString(q, "").trim())
        .filter((v): v is string => Boolean(v))
        .slice(0, 6)
    : [];

  const finalPortion: PhotoPortion | null =
    portion ||
    (fallbackGrams != null
      ? { label: `${fallbackGrams} г`, gramsApprox: fallbackGrams }
      : null);

  const isFood = resolveIsFood(obj["isFood"], outMacros);

  // Відмова мусить виглядати як відмова у КОЖНОМУ полі, не лише у прапорці:
  // саме напівзаповнений результат («Кіт», 0 ккал, питання про порцію) UI і
  // показував як їжу. Гасимо КБЖВ і питання тут, у нормалізаторі, щоб жоден
  // споживач — web, mobile, стенд — не мусив повторювати цю перевірку.
  if (!isFood) {
    return {
      isFood,
      notFoodKind: resolveNotFoodKind(obj["notFoodKind"]),
      dishName,
      confidence,
      portion: finalPortion,
      ingredients,
      items: [],
      macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
      questions: [],
    };
  }

  // Підсумок рахуємо з позицій, а не беремо окреме число моделі: інакше
  // видалення рядка на картці нічого б не змінило в сумі, і це рівно той
  // баг, від якого ініціатива 0023 тікає. Коли масиву немає (стара модель,
  // порваний вивід), синтезуємо одну позицію з `dishName` — споживач завжди
  // має щонайменше один рядок, а сума лишається тим самим числом, що й досі.
  const normalizedMacros = unknownMacrosAsNull(outMacros, questions);
  const items: PhotoItem[] = rawItems.length
    ? rawItems
    : [
        {
          name: dishName,
          macros: normalizedMacros,
          gramsApprox: finalPortion?.gramsApprox ?? null,
          confidence,
        },
      ];

  return {
    isFood,
    notFoodKind: null,
    dishName,
    confidence,
    portion: finalPortion,
    ingredients,
    items,
    macros: rawItems.length
      ? sumMacrosNullable(rawItems.map((i) => i.macros))
      : normalizedMacros,
    questions,
  };
}

/**
 * Нулі, які насправді означають «не порахував», → `null`.
 *
 * WHY. Контракт має `null` для невідомого, але модель про це не знала, і на
 * фото цінника Сільпо (назва + вага, таблиці харчової цінності немає) вона
 * віддавала `{ kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 }` разом із
 * `confidence: 0.9` і питаннями про порцію. Обидва клієнти показували це як
 * упевнену відповідь: `fmtMacro` малює `null` як «—», а нуль — як «0», і
 * `hasAnyMacro` (перевірка `!= null`) пропускала нулі, тож поруч світився
 * ще й відсоток. Людина бачила «0 ккал, впевненість 90%» на реальній страві
 * і могла зберегти її в журнал такою.
 *
 * Дискримінант — саме НЕВІДПОВІДЕНІ питання. Модель, яка ще питає «яка
 * порція?», за власним визнанням оцінку не завершила, тож її нулі — це
 * чернетка. Коли питань немає, нулі лишаються недоторканими: склянка води і
 * чай без цукру — легальний нуль, і затирати його було б брехнею в інший бік.
 *
 * Промпти обох шляхів тепер теж просять `null` замість нулів (див.
 * `analyze-photo.ts` § «Нуль і „не знаю“»). Це той самий принцип, що і в
 * `resolveIsFood` та `mergeDuplicatePantryItem`: інваріант, який ламається
 * тихо, тримає код, а не слухняність моделі.
 */
function unknownMacrosAsNull(
  macros: PhotoMacros,
  questions: readonly string[],
): PhotoMacros {
  if (questions.length === 0) return macros;
  const values = [macros.kcal, macros.protein_g, macros.fat_g, macros.carbs_g];
  const allZero = values.every((v) => v === 0);
  if (!allZero) return macros;
  return { kcal: null, protein_g: null, fat_g: null, carbs_g: null };
}

/**
 * Категорія не-їжі — з тією ж недовірою до слухняності моделі, що й
 * `resolveIsFood` нижче.
 *
 * Два послаблення проти буквального контракту, обидва вимушені. По-перше,
 * промпт цілком україномовний, тож модель регулярно віддає значення теж
 * українською («тварина» замість `"animal"`) — просити англійський enum
 * посеред української інструкції і потім вірити на слово ми вже пробували на
 * `isFood`. По-друге, невідоме значення НЕ роняє відмову: воно згортається в
 * `"other"`, і людина бачить нейтральний текст замість порожнечі. Гірший
 * сценарій тут — «кіт» із загальною реплікою, а не зламаний екран.
 */
function resolveNotFoodKind(declared: unknown): NotFoodKind {
  const raw = typeof declared === "string" ? declared.trim().toLowerCase() : "";
  if (/^(animal|pet|тварин)/.test(raw)) return "animal";
  if (/^(person|human|people|людин)/.test(raw)) return "person";
  return "other";
}

/**
 * Чи вважати результат їжею — детермінованим кодом, а не лише проханням у промпті.
 *
 * WHY. Промпт просить `isFood: false` на не-їжі, але покладатись лише на це вже
 * коштувало нам бага: до появи поля контракт узагалі не мав способу сказати «це
 * не їжа», і `gemini-2.5-flash-lite` слухняно віддавав `{ dishName: "Кіт",
 * confidence: 1, macros: 0, questions: ["Чи є на фото щось інше, окрім кота?"] }`
 * — і кота можна було зберегти в денний журнал як `macroSource: photoAI`.
 * Той самий принцип, що й у `mergeDuplicatePantryItem` нижче: інваріант, який
 * ламається тихо, тримає код, а не слухняність моделі.
 *
 * Два входи, і порядок між ними важливий:
 *
 *   1. Явне `isFood` від моделі — головніше за все. Модель, яка вміє поле,
 *      дотримується й решти контракту, тому `true` з нульовими КБЖВ (склянка
 *      води, чай без цукру) лишається їжею — це легальний випадок.
 *   2. Поля немає взагалі (стара або неслухняна модель) — виводимо з КБЖВ:
 *      без жодного додатного числа немає що записувати в журнал, тож це
 *      відмова. Компроміс свідомий: фото води від моделі, яка проігнорувала
 *      контракт, теж отримає відмову.
 */
function resolveIsFood(declared: unknown, macros: PhotoMacros): boolean {
  // Моделі повертають прапорці і рядком ("false"), і числом (0) — JSON тут
  // пише LLM, не типізований клієнт.
  if (typeof declared === "boolean") return declared;
  if (typeof declared === "string") {
    const s = declared.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  if (typeof declared === "number" && Number.isFinite(declared)) {
    return declared !== 0;
  }
  return [macros.kcal, macros.protein_g, macros.fat_g, macros.carbs_g].some(
    (v) => v != null && v > 0,
  );
}

export function normalizePantryItems(parsed: unknown): PantryItem[] {
  const rawItems =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { items?: unknown }).items
      : parsed;
  const items: unknown[] = Array.isArray(rawItems) ? rawItems : [];
  return items
    .slice(0, 80)
    .map((x): PantryItem | null => {
      if (!x || typeof x !== "object") return null;
      const rec = x as Record<string, unknown>;
      const name = safeString(rec["name"], "").trim();
      if (!name) return null;
      const qty =
        rec["qty"] == null || rec["qty"] === ""
          ? null
          : safeNumberOrNull(rec["qty"]);
      let unit: string | null =
        rec["unit"] == null || rec["unit"] === ""
          ? null
          : safeString(rec["unit"], "").trim();
      if (qty != null && unit == null) unit = "шт";
      const notes =
        rec["notes"] == null || rec["notes"] === ""
          ? null
          : safeString(rec["notes"], "").trim();
      return { name, qty, unit, notes };
    })
    .filter((v): v is PantryItem => Boolean(v))
    .reduce(mergeDuplicatePantryItem, []);
}

/**
 * Обʼєднання дублікатів комори — детермінованим кодом, не проханням до моделі.
 *
 * WHY. Промпт `parse-pantry` вимагає обʼєднувати повтори з першого дня, і всі
 * перевірені моделі (gemini-2.5-flash-lite, sonnet-4.6) однаково його ігнорують:
 * вхід «молоко 1 л … молоко … йогурт … йогурт 2» переписується рядок у рядок,
 * бо надиктований список читається як послідовність, а не як множина. Дублікат
 * у коморі тихо ламає і список покупок, і план — рахує продукт двічі. Сусідній
 * `shopping-list` уже має рівно такий Set-guard у хендлері; тут його бракувало.
 *
 * Пріоритет полів дзеркалить промпт: перемагає запис із `qty`, суми не
 * додаються (надиктоване «молоко» після «молоко 1 л» — це та сама пляшка, а не
 * друга). Позиція в списку — за першою згадкою.
 */
function mergeDuplicatePantryItem(
  acc: PantryItem[],
  item: PantryItem,
): PantryItem[] {
  const key = item.name.toLowerCase().replace(/\s+/g, " ").trim();
  const seen = acc.find(
    (p) => p.name.toLowerCase().replace(/\s+/g, " ").trim() === key,
  );
  if (!seen) return [...acc, item];
  if (seen.qty == null && item.qty != null) {
    seen.qty = item.qty;
    seen.unit = item.unit;
  }
  seen.notes ??= item.notes;
  return acc;
}

export function normalizeRecipes(parsed: unknown): NormalizedRecipe[] {
  const rawRecipes =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { recipes?: unknown }).recipes
      : parsed;
  const recipes: unknown[] = Array.isArray(rawRecipes) ? rawRecipes : [];
  return recipes
    .slice(0, 6)
    .map((r): NormalizedRecipe | null => {
      if (!r || typeof r !== "object") return null;
      const rec = r as Record<string, unknown>;
      const title = safeString(rec["title"], "").trim();
      const timeMinutes =
        rec["timeMinutes"] == null
          ? null
          : safeNumberOrNull(rec["timeMinutes"]);
      const servings =
        rec["servings"] == null ? null : safeNumberOrNull(rec["servings"]);
      const ingredients: string[] = Array.isArray(rec["ingredients"])
        ? (rec["ingredients"] as unknown[])
            .map((x) => safeString(x, "").trim())
            .filter((v): v is string => Boolean(v))
            .slice(0, 30)
        : [];
      const steps: string[] = Array.isArray(rec["steps"])
        ? (rec["steps"] as unknown[])
            .map((x) => safeString(x, "").trim())
            .filter((v): v is string => Boolean(v))
            .slice(0, 10)
        : [];
      const tips: string[] = Array.isArray(rec["tips"])
        ? (rec["tips"] as unknown[])
            .map((x) => safeString(x, "").trim())
            .filter((v): v is string => Boolean(v))
            .slice(0, 8)
        : [];
      const mRaw = rec["macros"];
      const m =
        mRaw && typeof mRaw === "object" && !Array.isArray(mRaw)
          ? (mRaw as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      const macros: RecipeMacros = {
        kcal: safeNonNegNumberOrNull(m["kcal"]),
        protein_g: safeNonNegNumberOrNull(m["protein_g"]),
        fat_g: safeNonNegNumberOrNull(m["fat_g"]),
        carbs_g: safeNonNegNumberOrNull(m["carbs_g"]),
      };
      return {
        title: title || "Рецепт",
        timeMinutes,
        servings,
        ingredients,
        steps,
        tips,
        macros,
      };
    })
    .filter((v): v is NormalizedRecipe => Boolean(v));
}
