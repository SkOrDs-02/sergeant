/**
 * Тур синтезу чату на прод-розмірі входу (стенд `pnpm eval:models`).
 *
 * AI-CONTEXT: пайплайни `chat` і `analysis` шлють у модель лише
 * `SYSTEM_PREFIX` і одну репліку з результатом інструмента, разом близько 2k
 * токенів. Прод-синтез несе 9–10k: той самий префікс, блок ДАНІ з контекстом
 * людини (операції, бюджети, звички, харчування, тренування, памʼять) і
 * результати інструментів (`docs/work/research/2026-11-19-openrouter-new-models.md`
 * § 6.2, застереження). Рішення власника 2026-11-19 про глибину синтезу
 * Premium (`z-ai/glm-5.2`) вимагало доперевірки саме на такому вході: модель,
 * що тримає пастку на 2k, може загубити її в довгому контексті.
 *
 * Що тут прод, а що ні. `system` будує продовий `buildSystem()` (префікс +
 * огорожа `<user_data>` навколо ДАНИХ), склеєний у рядок, бо стенд ходить
 * через `/chat/completions`. Блок ДАНІ правдоподібний і детермінований, а не
 * копія продового білдера (той самий підхід, що `toolEval/dataBlock.ts`):
 * мета — розмір і щільність чисел, а не байт-у-байт рядок. Кейси — вісім
 * пасток `analysis` дослівно плюс два кейси з кількома числами, де втрата
 * одного з них і є провалом.
 */

import { env } from "../../src/env/env.js";
import { buildSystem } from "../../src/modules/chat/promptCache.js";
import { mentions, nonEmptyUk, synthesisTurn } from "./judges.js";
import { FINANCE_PIPELINES } from "./pipelines.finance.js";
import type { GoldenCase, JudgeVerdict, Pipeline } from "./types.js";

const CATEGORIES: Array<[string, string]> = [
  ["cat_groceries", "Продукти"],
  ["cat_food_out", "Їжа поза домом"],
  ["cat_transport", "Транспорт"],
  ["cat_utilities", "Комуналка"],
  ["cat_rent", "Оренда"],
  ["cat_subscriptions", "Підписки"],
  ["cat_health", "Здоровʼя"],
  ["cat_sport", "Спорт"],
  ["cat_clothes", "Одяг"],
  ["cat_gifts", "Подарунки"],
  ["cat_home", "Дім"],
  ["cat_fun", "Розваги"],
];

/** Детермінований псевдовипадковий ряд: прогони відтворювані. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Мерчант і реалістичний діапазон суми, грн. Вага — частота в місяці. */
const MERCHANTS: Array<{
  cat: string;
  names: string[];
  min: number;
  max: number;
  weight: number;
}> = [
  {
    cat: "cat_groceries",
    names: ["АТБ", "Сільпо", "Новус", "Фора", "ринок"],
    min: 60,
    max: 900,
    weight: 30,
  },
  {
    cat: "cat_food_out",
    names: ["кава", "Пузата хата", "доставка Glovo", "піца", "обід"],
    min: 55,
    max: 450,
    weight: 22,
  },
  {
    cat: "cat_transport",
    names: ["метро", "Bolt", "Uklon", "маршрутка"],
    min: 8,
    max: 260,
    weight: 25,
  },
  { cat: "cat_health", names: ["аптека"], min: 90, max: 600, weight: 3 },
  {
    cat: "cat_home",
    names: ["Епіцентр", "JYSK", "побутова хімія"],
    min: 120,
    max: 900,
    weight: 4,
  },
  {
    cat: "cat_fun",
    names: ["кіно", "Steam", "книгарня"],
    min: 150,
    max: 500,
    weight: 4,
  },
];

/**
 * Операції за ЧЕРВЕНЬ: фон того самого розміру, що в проді, але без сум за
 * липень, про який питають кейси. Липневі суми кейси приносять у результаті
 * інструмента; якби ДАНІ теж їх несли, модель звіряла б два джерела, і стенд
 * міряв би вже не пастку кейса (перший прогін 2026-11-19 з липневими
 * операціями саме так і зсунувся).
 */
function operationsBlock(): string {
  const rnd = lcg(20260630);
  const total = MERCHANTS.reduce((sum, m) => sum + m.weight, 0);
  const pick = () => {
    let x = rnd() * total;
    for (const m of MERCHANTS) {
      x -= m.weight;
      if (x <= 0) return m;
    }
    return MERCHANTS[0]!;
  };
  const rows: string[] = [];
  // 210 операцій (7 на день): разом із рештою ДАНИХ і префіксом вхід близько
  // 9,5k токенів, як у проді. 90 операцій давали 6,1k.
  for (let i = 0; i < 210; i++) {
    const day = 30 - Math.floor(i / 7);
    const m = pick();
    const merchant = m.names[Math.floor(rnd() * m.names.length)] ?? "інше";
    const amount = Math.round(m.min + rnd() * (m.max - m.min));
    const title = CATEGORIES.find(([id]) => id === m.cat)?.[1] ?? "Інше";
    rows.push(
      `- tx_${(0xa000 + i).toString(16)} — 2026-06-${String(day).padStart(2, "0")}, ${amount} грн, ${title}, «${merchant}»`,
    );
  }
  return rows.join("\n");
}

function nutritionBlock(): string {
  const rnd = lcg(7);
  const rows: string[] = [];
  for (let d = 18; d <= 31; d++) {
    const kcal = Math.round(1700 + rnd() * 900);
    const p = Math.round(70 + rnd() * 60);
    const f = Math.round(50 + rnd() * 40);
    const c = Math.round(180 + rnd() * 120);
    rows.push(
      `- 2026-07-${d}: ${kcal} ккал (Б ${p} г, Ж ${f} г, В ${c} г); сніданок вівсянка з бананом, обід гречка з куркою, вечеря салат і сир`,
    );
  }
  return rows.join("\n");
}

function workoutsBlock(): string {
  const lines = [
    "- 2026-07-29: присідання 4×6 по 90 кг, жим лежачи 4×5 по 80 кг, тяга верхнього блока 3×10 по 55 кг",
    "- 2026-07-26: станова тяга 3×5 по 110 кг, жим стоячи 4×6 по 45 кг, підтягування 4×7",
    "- 2026-07-24: біг 6,2 км за 34 хв, пульс середній 152",
    "- 2026-07-22: присідання 4×6 по 87,5 кг, жим лежачи 4×5 по 77,5 кг, віджимання на брусах 3×10",
    "- 2026-07-19: станова тяга 3×5 по 107,5 кг, жим стоячи 4×6 по 42,5 кг, підтягування 4×6",
    "- 2026-07-17: біг 5,8 км за 33 хв, пульс середній 155",
    "- 2026-07-15: присідання 4×6 по 85 кг, жим лежачи 4×5 по 75 кг, тяга штанги в нахилі 3×8 по 60 кг",
  ];
  return lines.join("\n");
}

function habitsBlock(): string {
  return [
    "- hab_morning — Ранкова зарядка: серія 12 днів, за тиждень 6/7",
    "- hab_water — Склянка води зранку: серія 31 день, за тиждень 7/7",
    "- hab_reading — Читання 20 хвилин: серія 0, за тиждень 3/7",
    "- hab_steps — 8000 кроків: серія 4 дні, за тиждень 5/7",
    "- hab_sleep — Лягти до 23:30: серія 1 день, за тиждень 2/7",
    "- hab_english — Англійська 15 хвилин: серія 0, за тиждень 1/7",
    "- hab_meditation — Медитація 10 хвилин: серія 5 днів, за тиждень 5/7",
    "- hab_no_sugar — Без солодкого: лічильник 2 з цілі 7 на тиждень",
  ].join("\n");
}

function budgetsBlock(): string {
  return [
    "- Продукти: ліміт 9000 грн/міс",
    "- Їжа поза домом: ліміт 3000 грн/міс",
    "- Транспорт: ліміт 2000 грн/міс",
    "- Розваги: ліміт 1500 грн/міс",
    "- Підписки: ліміт 600 грн/міс",
    "- Ціль «Подушка безпеки»: 60000 грн до кінця 2027 року",
    "- Ціль «Відпустка у вересні»: 25000 грн",
  ].join("\n");
}

function memoryBlock(): string {
  return [
    "- Працює дизайнером, зарплата приходить 5 і 20 числа",
    "- Живе з партнеркою, оренду ділять навпіл",
    "- Не їсть свинину",
    "- Хоче скинути 4 кг до жовтня, поточна вага 82,4 кг (була 84,1 кг 1 липня)",
    "- Коліно болить після бігу понад 8 км",
    "- Любить короткі відповіді без вступів",
  ].join("\n");
}

/**
 * Блок ДАНІ прод-розміру. Свідомо не перетинається з цифрами кейсів: ті
 * приходять у результаті інструмента, а ДАНІ — фон, у якому їх треба знайти.
 * Ліміти бюджетів ті самі, що в кейсі «кілька лімітів».
 */
export const PROD_SIZE_DATA_BLOCK = `Сьогодні: 2026-07-31 (пʼятниця), Europe/Kyiv. Тиждень рахуємо з понеділка.

[Категорії]
${CATEGORIES.map(([id, name]) => `- ${id} — ${name}`).join("\n")}

[Бюджети й цілі]
${budgetsBlock()}

[Рахунки]
- acc_mono_black — Монобанк, чорна картка
- acc_privat — ПриватБанк, зарплатна
- acc_cash — Готівка

[Операції за червень]
${operationsBlock()}

[Звички]
${habitsBlock()}

[Харчування, останні 14 днів; ціль 2100 ккал]
${nutritionBlock()}

[Тренування]
${workoutsBlock()}

[Вага]
- 2026-07-01: 84,1 кг; 2026-07-08: 83,6 кг; 2026-07-15: 83,2 кг; 2026-07-22: 82,9 кг; 2026-07-29: 82,4 кг

[Памʼять]
${memoryBlock()}`;

/** Склеєний продовий system (стенд іде через `/chat/completions`). */
const PROD_SIZE_SYSTEM = buildSystem(PROD_SIZE_DATA_BLOCK)
  .map((block) => block.text)
  .join("\n\n");

/** Усі числа зі списку присутні у відповіді (пробіли в тисячах не важливі). */
function allNumbers(numbers: string[], label: string) {
  return (text: string): JudgeVerdict => {
    if (!nonEmptyUk(text)) return "порожня або не українська відповідь";
    const flat = text.replace(/(\d)[\s\u00a0\u202f](?=\d{3}\b)/g, "$1");
    const missing = numbers.filter((n) => !flat.includes(n));
    return missing.length === 0 || `${label}: бракує ${missing.join(", ")}`;
  };
}

function both(
  a: (text: string) => JudgeVerdict,
  b: (text: string) => JudgeVerdict,
) {
  return (text: string): JudgeVerdict => {
    const first = a(text);
    if (first !== true) return first;
    return b(text);
  };
}

const MULTI_NUMBER_CASES: GoldenCase[] = [
  {
    name: "кілька лімітів",
    trap: "НЕПРАВИЛЬНО: назвати лише один перевищений ліміт. Перевищено два (їжа поза домом на 870 грн і підписки на 45 грн), і обидва треба назвати з сумами.",
    user: synthesisTurn(
      "Які ліміти я цього місяця перевищив?",
      "get_budget_status",
      "продукти: ліміт 9000, витрачено 8640; їжа поза домом: ліміт 3000, витрачено 3870; транспорт: ліміт 2000, витрачено 1310; розваги: ліміт 1500, витрачено 640; підписки: ліміт 600, витрачено 645",
    ),
    judge: both(
      mentions(/поза домом|їж/i, "перевищення їжі поза домом"),
      both(
        mentions(/підписк/i, "перевищення підписок"),
        allNumbers(["870", "45"], "суми перевищень"),
      ),
    ),
  },
  {
    name: "три місяці",
    trap: "НЕПРАВИЛЬНО: сказати «витрати стабільні». Разом за три місяці майже рівно, але їжа поза домом зросла з 2100 до 4870 грн, а продукти впали з 9800 до 7420: людина заміняє кухню доставкою. Треба назвати обидва зсуви з числами.",
    user: synthesisTurn(
      "Як змінились мої витрати за три місяці?",
      "compare_periods",
      "травень: продукти 9800, їжа поза домом 2100, транспорт 1400, разом 13300; червень: продукти 8600, їжа поза домом 3300, транспорт 1350, разом 13250; липень: продукти 7420, їжа поза домом 4870, транспорт 1310, разом 13600",
    ),
    judge: both(
      mentions(/поза домом|доставк|кафе|їж/i, "зсув у їжу поза домом"),
      allNumbers(["4870", "7420"], "кінцеві суми зсуву"),
    ),
  },
];

function analysisCases(): GoldenCase[] {
  const analysis = FINANCE_PIPELINES.find((p) => p.key === "analysis");
  if (!analysis) throw new Error("пайплайн analysis зник зі стенду");
  return analysis.cases;
}

export const synthesisProdPipeline: Pipeline = {
  key: "synthesis-prod",
  label: "Chat synthesis at prod input size (~9–10k tokens)",
  system: PROD_SIZE_SYSTEM,
  promptOrigin:
    "modules/chat/promptCache.ts::buildSystem(SYSTEM_PREFIX + ДАНІ прод-розміру)",
  maxTokens: 2500,
  judge: (text) => nonEmptyUk(text) || "порожня або не українська відповідь",
  checkVoice: "chat",
  cacheable: true,
  cases: [...analysisCases(), ...MULTI_NUMBER_CASES],
  // Premium-синтез (`CHAT_MODEL_SYNTHESIS`, за замовчуванням `z-ai/glm-5.2`)
  // у двох режимах: «як зараз» (без поля `reasoning`, шлюз ставить свій
  // дефолт) і `none`. Інші режими — через `--extra`.
  candidates: [
    {
      provider: "openrouter",
      model: env.CHAT_MODEL_SYNTHESIS,
      label: "premium, як зараз (без глибини)",
    },
    {
      provider: "openrouter",
      model: env.CHAT_MODEL_SYNTHESIS,
      label: "premium, none",
      reasoning: "none",
    },
  ],
};
