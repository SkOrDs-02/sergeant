/**
 * Пайплайни фінансових і крос-модульних AI-шляхів.
 *
 * ІНВАРІАНТ ЦЬОГО ФАЙЛУ: жодного рукописного системного промпту. Кожен
 * `system` приходить з продового білдера — саме розходження копії з продом і
 * зробило попередню ітерацію стенду недійсною (модель відповідала «Записую
 * транзакцію…», бо міряли не той промпт).
 *
 * ПОРЯДОК НАПИСАННЯ КЕЙСІВ: спершу `trap` — одне речення про те, що для цієї
 * задачі означає «неправильно»; лише потім `judge`. У попередній ітерації
 * судді писалися під наявні відповіді й помилилися шість разів в обидва боки
 * (зарахували пораду поставити підписки 340 грн/міс поперед боргу 42 000 під
 * 32% річних; завалили правильну поведінку, коли модель зробила
 * `query_transactions` перед видаленням).
 */

import { env } from "../../src/env/env.js";
import { SYSTEM_PREFIX } from "../../src/modules/chat/toolDefs/systemPrompt.js";
import { buildCategorizePrompt } from "../../src/routes/internal/categorize.js";
import { buildWeeklyDigestPrompt } from "../../src/modules/digest/weekly-digest.js";
import { buildCoachInsightPrompt } from "../../src/modules/chat/coach.js";
import {
  buildBatchPrompt,
  parseBatchResponse,
} from "../../src/lib/mcc/batchPrompt.js";
import type { UnknownMccItem } from "../../src/lib/mcc/unknownQueue.js";
import type { WeeklyDigestRequest } from "@sergeant/shared";
import {
  categoryIs,
  digestParsesVerdict,
  digestReport,
  mentions,
  noInventedAmounts,
  nonEmptyUkVerdict,
  synthesisTurn,
} from "./judges.js";
import type { JudgeVerdict, Pipeline } from "./types.js";

// ── classify (`internal/categorize`) ────────────────────────────────
//
// Прод спершу резолвить MCC детерміністично (`lookupMccCategory`), і до
// моделі доїжджають ЛИШЕ невідомі коди. Тому всі MCC у кейсах нижче свідомо
// ВІДСУТНІ в `mccMap.ts` — інакше стенд міряв би шлях, якого в проді немає.
const classifyCase = (
  name: string,
  trap: string,
  args: { description: string; amount?: number; mcc?: number },
  judge: (text: string) => boolean,
) => ({
  name,
  trap,
  user: buildCategorizePrompt(args).user,
  judge,
});

const CLASSIFY_SYSTEM = buildCategorizePrompt({ description: "x" }).system;

const classifyPipeline: Pipeline = {
  key: "classify",
  label: "Finyk classify (internal/categorize)",
  system: CLASSIFY_SYSTEM,
  promptOrigin: "routes/internal/categorize.ts::buildCategorizePrompt",
  maxTokens: 120,
  judge: categoryIs([
    "groceries",
    "transport",
    "dining",
    "entertainment",
    "utilities",
    "health",
    "shopping",
    "education",
    "subscriptions",
    "income",
    "transfer",
    "other",
  ]),
  cases: [
    classifyCase(
      "MCC суперечить торговцю",
      "НЕПРАВИЛЬНО: піти за числом MCC (5169 — оптова хімія → shopping) замість опису. Аптека — це health, і опис тут авторитетніший за код терміналу.",
      { description: "АПТЕКА ПОДОРОЖНИК №12", amount: -24500, mcc: 5169 },
      categoryIs(["health"]),
    ),
    classifyCase(
      "торговець поза списком категорій",
      "НЕПРАВИЛЬНО: впевнено приписати ветклініку до health (це категорія здоровʼя ЛЮДИНИ) чи до groceries. Прийнятно: other, або health із невисокою впевненістю.",
      { description: "ВЕТКЛІНІКА ХВОСТИК", amount: -85000, mcc: 742 },
      (text) =>
        categoryIs(["other"])(text) ||
        categoryIs(["health"], { maxConfidence: 0.8 })(text),
    ),
    classifyCase(
      "надходження, не переказ",
      "НЕПРАВИЛЬНО: transfer. Зарплата з додатним знаком — income; плутанина income/transfer ламає всю фінансову картину, бо дохід зникає зі звіту.",
      {
        description: "ЗАРАХУВАННЯ ЗАРПЛАТИ ТОВ АЛЬФА",
        amount: 4200000,
        mcc: 6532,
      },
      categoryIs(["income"]),
    ),
    classifyCase(
      "замаскований P2P",
      "НЕПРАВИЛЬНО: shopping/other. Опис уже пройшов `maskPii`, номер картки перетворився на маску — модель має впізнати переказ, а не вирішити, що маска є назвою торговця.",
      { description: "Переказ на картку 44**7788", amount: -150000, mcc: 6536 },
      categoryIs(["transfer"]),
    ),
    classifyCase(
      "нерозбірливий дескриптор",
      "НЕПРАВИЛЬНО: вгадати категорію з високою впевненістю. З `PAYMENT*XJ4471` витягти нічого; чесна відповідь — other із низькою впевненістю. Впевнене вгадування тут гірше за відмову, бо воно мовчки псує статистику.",
      { description: "PAYMENT*XJ4471", amount: -32000 },
      categoryIs(["other"], { maxConfidence: 0.6 }),
    ),
  ],
  candidates: [
    {
      provider: "anthropic",
      model: env.CLASSIFY_MODEL,
      label: "current default (Anthropic)",
    },
    {
      provider: "openrouter",
      model: "google/gemini-2.5-flash-lite",
      label: "OpenRouter Gemini Flash Lite",
    },
  ],
};

// ── digest (`internal/weekly-digest`) ───────────────────────────────
//
// Промпт динамічний: `buildWeeklyDigestPrompt` вшиває блок ДАНІ в system, а
// user-репліка — фіксований JSON-шаблон. Тому кожен кейс перекриває `system`
// власним тижнем, а `user` у всіх однаковий.
const digestWeek = (
  name: string,
  trap: string,
  data: WeeklyDigestRequest,
  judge?: (text: string) => JudgeVerdict,
) => {
  const prompt = buildWeeklyDigestPrompt(data);
  return {
    name,
    trap,
    system: prompt.system,
    user: prompt.user,
    ...(judge ? { judge } : {}),
  };
};

const DIGEST_BASE: WeeklyDigestRequest = {
  weekRange: "2026-07-20 – 2026-07-26",
  finyk: {
    totalSpent: 8420,
    totalIncome: 32000,
    monthlyBudget: 30000,
    txCount: 41,
    topCategories: [
      { name: "продукти", amount: 3100 },
      { name: "їжа поза домом", amount: 2400 },
      { name: "транспорт", amount: 900 },
    ],
  },
  fizruk: {
    workoutsCount: 3,
    totalVolume: 12400,
    recoveryLabel: "норма",
    topExercises: [{ name: "присідання", totalVolume: 4200 }],
  },
  nutrition: {
    avgKcal: 1980,
    targetKcal: 2200,
    avgProtein: 96,
    avgFat: 72,
    avgCarbs: 210,
    daysLogged: 6,
  },
  routine: {
    overallRate: 71,
    habitCount: 3,
    habits: [{ name: "читання", completionRate: 57, done: 4, total: 7 }],
  },
};

const digestPipeline: Pipeline = {
  key: "digest",
  label: "Weekly-digest AI-commentary",
  system: buildWeeklyDigestPrompt(DIGEST_BASE).system,
  promptOrigin: "modules/digest/weekly-digest.ts::buildWeeklyDigestPrompt",
  maxTokens: 2500,
  // Структурний суддя: прод валідує відповідь `WeeklyDigestReportSchema` і на
  // промах віддає 502 або тихо підміняє шаблоном. Не спарсилось = зламано.
  judge: digestParsesVerdict,
  cases: [
    digestWeek(
      "повний тиждень",
      "НЕПРАВИЛЬНО: невалідний JSON, markdown-обгортка або відсутні ключі — прод на це віддає 502 ANTHROPIC_SHAPE_MISMATCH.",
      DIGEST_BASE,
    ),
    digestWeek(
      "дірка в даних",
      "НЕПРАВИЛЬНО: подати середньодобові 1980 ккал як факт тижня, коли записів лише 2 дні з 7, а транзакцій — жодної. Правильно: назвати дані неповними й не будувати на них тренд.",
      {
        ...DIGEST_BASE,
        finyk: {
          totalSpent: 0,
          totalIncome: 0,
          monthlyBudget: 30000,
          txCount: 0,
        },
        nutrition: {
          avgKcal: 1980,
          targetKcal: 2200,
          avgProtein: 96,
          avgFat: 72,
          avgCarbs: 210,
          daysLogged: 2,
        },
      },
      (text) => {
        const base = digestParsesVerdict(text);
        if (base !== true) return base;
        return (
          /неповн|відсутн|мало даних|лише 2|2 з 7|бракує|не вистача|немає запис|немає транзакц/i.test(
            text,
          ) || "подав 2 дні з 7 як повний тиждень"
        );
      },
    ),
    digestWeek(
      "один модуль із чотирьох",
      "НЕПРАВИЛЬНО: вигадати блоки fizruk/nutrition/routine замість `null`. Промпт прямо каже повертати null для модулів без даних; вигадані блоки доїжджають до UI як справжні.",
      { weekRange: DIGEST_BASE.weekRange, finyk: DIGEST_BASE.finyk },
      (text) => {
        const report = digestReport(text);
        if (report === null) {
          return "не пройшов WeeklyDigestReportSchema — прод віддав би 502";
        }
        const invented = (
          [
            ["fizruk", report.fizruk],
            ["nutrition", report.nutrition],
            ["routine", report.routine],
          ] as const
        )
          .filter(([, v]) => v !== null)
          .map(([k]) => k);
        return invented.length === 0 || `вигадав блоки: ${invented.join(", ")}`;
      },
    ),
    digestWeek(
      "перевитрата з боргом",
      "НЕПРАВИЛЬНО: рівно перелічити всі проблеми. Витрати 41 000 при доході 32 000 — головне; поради «менше кави» тут другорядні.",
      {
        ...DIGEST_BASE,
        finyk: {
          totalSpent: 41000,
          totalIncome: 32000,
          monthlyBudget: 30000,
          txCount: 63,
          topCategories: [
            { name: "оренда", amount: 12000 },
            { name: "їжа поза домом", amount: 6800 },
            { name: "кава", amount: 900 },
          ],
        },
      },
      (text) => {
        const base = digestParsesVerdict(text);
        if (base !== true) return base;
        return (
          /перевищ|більше ніж дохід|мінус|дефіцит|витрати вищ|9000|9 000/i.test(
            text,
          ) || "не назвав головне: витрати 41 000 при доході 32 000"
        );
      },
    ),
  ],
  candidates: [
    {
      provider: "anthropic",
      model: env.DIGEST_MODEL,
      label: "current default (Anthropic)",
    },
    {
      provider: "openrouter",
      model: "google/gemini-2.5-flash-lite",
      label: "OpenRouter Gemini Flash Lite",
    },
  ],
};

// ── mono (`internal/mcc-batch`) ─────────────────────────────────────

let monoQueueId = 0;
const monoItem = (
  description: string,
  amount: number,
  mcc: number | null,
): UnknownMccItem => {
  monoQueueId += 1;
  return {
    queueId: monoQueueId,
    userId: "eval",
    monoTxId: `eval-${monoQueueId}`,
    description,
    amount,
    mcc,
    enqueuedAt: 0,
    attempts: 0,
  };
};

const MONO_CLEAN_BATCH = [
  monoItem("АПТЕКА ПОДОРОЖНИК", -24500, 5169),
  monoItem("ВЕТКЛІНІКА ХВОСТИК", -85000, 742),
  monoItem("Переказ на картку 44**7788", -150000, 6536),
];

// Пастка партії: рядки 2 і 4 — сміття (обрізаний дескриптор і службовий
// службовий код терміналу). Прод НЕ дозволяє їх пропустити: `parseBatchResponse`
// вважає відсутній індекс `missing`, і такий item іде на повторний тік, а після
// трьох — у per-row чергу. Тобто «пропустив сміття» коштує грошей і затримки.
const MONO_DIRTY_BATCH = [
  monoItem("СІЛЬПО МАРКЕТ", -31200, 6536),
  monoItem("***", -100, null),
  monoItem("ЗАРАХУВАННЯ ЗАРПЛАТИ ТОВ АЛЬФА", 4200000, 6532),
  monoItem("TRM4471//UAH//0000", -5000, 6532),
  monoItem("УКРЗАЛІЗНИЦЯ КВИТОК", -48000, 4789),
];

/** Чи змогла б прод-функція записати в БД КОЖЕН індекс партії. */
const monoCoversAll =
  (items: UnknownMccItem[]) =>
  (text: string): boolean =>
    parseBatchResponse(text, items).missing.length === 0;

const monoPipeline: Pipeline = {
  key: "mono",
  label: "Mono/Finyk MCC batch-enrichment",
  system: buildBatchPrompt(MONO_CLEAN_BATCH).system,
  promptOrigin: "lib/mcc/batchPrompt.ts::buildBatchPrompt",
  maxTokens: 2000,
  judge: monoCoversAll(MONO_CLEAN_BATCH),
  cases: [
    {
      name: "чиста партія",
      trap: "НЕПРАВИЛЬНО: пропустити індекс або віддати markdown-fence. `parseBatchResponse` кладе такий item у `missing`, і він іде на повторний прогін — заплачено двічі.",
      user: buildBatchPrompt(MONO_CLEAN_BATCH).user,
      judge: monoCoversAll(MONO_CLEAN_BATCH),
    },
    {
      name: "партія зі сміттям",
      trap: "НЕПРАВИЛЬНО: (а) пропустити сміттєві рядки d2/d4 — прод відправить їх на повторний тік; (б) впевнено приписати `***` реальну категорію. Правильно: КОЖЕН індекс присутній, сміттєві — `other` з низькою confidence.",
      user: buildBatchPrompt(MONO_DIRTY_BATCH).user,
      judge: (text) => {
        const parsed = parseBatchResponse(text, MONO_DIRTY_BATCH);
        if (parsed.missing.length > 0) return false;
        // Сміттєві рядки (індекси 1 і 3) мають бути `other`; впевнена
        // категорія на `***` — це і є тихе псування даних, заради якого
        // стенд існує.
        return [1, 3].every((i) => parsed.ok.get(i)?.category === "other");
      },
    },
  ],
  candidates: [
    {
      provider: "anthropic",
      model: env.MONO_ENRICHMENT_MODEL,
      label: "current default (Anthropic)",
    },
    {
      provider: "openrouter",
      model: "google/gemini-2.5-flash-lite",
      label: "OpenRouter Gemini Flash Lite",
    },
  ],
};

// ── coach-insight ───────────────────────────────────────────────────
//
// Прод шле ВСЕ одним user-повідомленням без `system` — стенд це дзеркалить.

const coachTurn = (
  name: string,
  trap: string,
  snapshot: Parameters<typeof buildCoachInsightPrompt>[0]["snapshot"],
  memory: Parameters<typeof buildCoachInsightPrompt>[0]["memory"],
  judge?: (text: string) => JudgeVerdict,
) => ({
  name,
  trap,
  user: buildCoachInsightPrompt({ snapshot, memory }).user,
  ...(judge ? { judge } : {}),
});

const COACH_MEMORY = {
  weeklyDigests: [
    {
      weekKey: "2026-W29",
      weekRange: "2026-07-13 – 2026-07-19",
      generatedAt: "2026-07-20T06:00:00.000Z",
      finyk: { summary: "Витрати 9100 грн, дохід 32000 грн." },
      fizruk: { summary: "4 тренування, обсяг 15200 кг." },
      nutrition: { summary: "Середньодобово 2050 ккал з 7/7 днів." },
      routine: { summary: "3 звички, 86%." },
      overallRecommendations: ["Тримати темп тренувань"],
      correlations: ["У дні тренувань витрати на доставку нижчі"],
    },
  ],
  lastInsightDate: null,
  lastInsightText: null,
};

const coachPipeline: Pipeline = {
  key: "coach-insight",
  label: "Coach proactive daily insight",
  // Прод не шле `system` — увесь текст іде user-реплікою.
  system: undefined,
  promptOrigin: "modules/chat/coach.ts::buildCoachInsightPrompt",
  maxTokens: 300,
  judge: nonEmptyUkVerdict,
  checkVoice: true,
  cases: [
    coachTurn(
      "звичайний тиждень",
      "НЕПРАВИЛЬНО: загальна мотивація без жодного числа з даних («ти молодець, продовжуй»). Промпт вимагає конкретний патерн І конкретну дію на сьогодні.",
      {
        dateContext: {
          todayKey: "2026-07-23",
          weekDayUk: "четвер",
          dayOfWeekIso: 4,
          daysIntoWeek: 4,
          weekRange: "2026-07-20 – 2026-07-26",
        },
        finyk: { totalSpent: 5400, totalIncome: 32000, txCount: 22 },
        fizruk: { workoutsCount: 2, totalVolume: 8100, recoveryLabel: "норма" },
        nutrition: {
          avgKcal: 1780,
          targetKcal: 2200,
          avgProtein: 71,
          daysLogged: 4,
        },
        routine: { overallRate: 64, habitCount: 3 },
      },
      COACH_MEMORY,
      mentions(/\d/, "жодного числа з даних"),
    ),
    coachTurn(
      "дати немає",
      "НЕПРАВИЛЬНО: вжити темпоральний маркер («сьогодні середина тижня», «тиждень майже закінчився»). Промпт прямо забороняє це, коли дата не передана — саме на цьому модель дала пораду «середина тижня» у неділю.",
      {
        finyk: { totalSpent: 5400, totalIncome: 32000, txCount: 22 },
        fizruk: { workoutsCount: 2, totalVolume: 8100 },
      },
      COACH_MEMORY,
      (text) => {
        const base = nonEmptyUkVerdict(text);
        if (base !== true) return base;
        const marker = text.match(
          /середин[аіу] тижня|кінець тижня|початок тижня|завершується тиждень/i,
        );
        return marker === null || `темпоральний маркер «${marker[0]}» без дати`;
      },
    ),
    coachTurn(
      "порожній перший сеанс",
      "НЕПРАВИЛЬНО: вигадати числа, яких немає («ти витратив 4200 грн»). Памʼяті немає, знімка немає — єдина чесна відповідь не містить конкретних сум.",
      {
        dateContext: {
          todayKey: "2026-07-23",
          weekDayUk: "четвер",
          dayOfWeekIso: 4,
          daysIntoWeek: 4,
        },
      },
      null,
      noInventedAmounts,
    ),
    coachTurn(
      "регрес проти памʼяті",
      "НЕПРАВИЛЬНО: похвалити прогрес. Памʼять каже 4 тренування й 86% звичок минулого тижня, зараз 1 і 29% — це падіння, і коуч має його назвати, а не привітати.",
      {
        dateContext: {
          todayKey: "2026-07-26",
          weekDayUk: "неділя",
          dayOfWeekIso: 7,
          daysIntoWeek: 7,
          weekRange: "2026-07-20 – 2026-07-26",
        },
        fizruk: { workoutsCount: 1, totalVolume: 3200, recoveryLabel: "втома" },
        routine: { overallRate: 29, habitCount: 3 },
      },
      COACH_MEMORY,
      mentions(
        /менш|нижч|впав|випав|спад|просі|порівнян|минул|[41] трен|одне трен|лише одн/i,
        "називання регресу проти минулого тижня",
      ),
    ),
  ],
  candidates: [
    {
      provider: "openrouter",
      model: env.OPENROUTER_COACH_MODEL,
      label: "current default (OpenRouter premium)",
    },
    {
      provider: "openrouter",
      model: env.AI_PRO_STANDARD_COACH_MODEL,
      label: "current standard tier",
    },
  ],
};

// ── chat / analysis ─────────────────────────────────────────────────
//
// Обидва йдуть на `SYSTEM_PREFIX` (v14) — рівно те, що прод кладе в
// cached-блок разом із 77 схемами інструментів.

const chatPipeline: Pipeline = {
  key: "chat",
  label: "Chat tool-result synthesis",
  system: SYSTEM_PREFIX,
  promptOrigin: "modules/chat/toolDefs/systemPrompt.ts::SYSTEM_PREFIX",
  maxTokens: 2500,
  judge: nonEmptyUkVerdict,
  checkVoice: true,
  cacheable: true,
  cases: [
    {
      name: "проста порада",
      trap: "НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.",
      user: synthesisTurn(
        "Скільки я цього тижня витратив на каву?",
        "query_transactions",
        "8 транзакцій, разом 960 грн, категорія «їжа поза домом», остання 2026-07-29 на 120 грн",
      ),
    },
    {
      name: "багато категорій",
      trap: "НЕПРАВИЛЬНО: переказати всі пʼять чисел підряд. Відповідь має назвати, куди пішла основна частина.",
      user: synthesisTurn(
        "Покажи мої витрати за липень",
        "aggregate_spending",
        "продукти 8420 грн, транспорт 1310 грн, їжа поза домом 4870 грн, комуналка 2600 грн, підписки 890 грн; дохід 32000 грн",
      ),
      judge: mentions(/продукт|їж|поза домом/i, "категорію найбільшої статті"),
    },
    {
      name: "порожні дані",
      trap: "НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.",
      user: synthesisTurn(
        "Як мої фінанси цього тижня?",
        "query_transactions",
        "транзакцій не знайдено; бюджет не налаштований",
      ),
      judge: noInventedAmounts,
    },
    {
      name: "перевитрата",
      trap: "НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.",
      user: synthesisTurn(
        "Як у мене з бюджетом цього місяця?",
        "aggregate_spending",
        "витрати 34200 грн, дохід 28000 грн; третій місяць поспіль витрати перевищують дохід",
      ),
      judge: mentions(
        /перевищ|більше|мінус|борг|скороти|дефіцит/i,
        "констатацію перевитрати",
      ),
    },
    {
      name: "порівняння періодів",
      trap: "НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.",
      user: synthesisTurn(
        "Порівняй їжу поза домом з минулим місяцем",
        "compare_periods",
        "їжа поза домом: липень 4870 грн, червень 2100 грн; решта категорій без змін",
      ),
      judge: mentions(
        /зрос|вирос|збільш|вдвіч|більш|рази?а?\b/i,
        "порівняння динаміки",
      ),
    },
    {
      name: "крос-модульний",
      trap: "НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.",
      user: synthesisTurn(
        "Як у мене з фінансами й тренуваннями?",
        "get_daily_series",
        "доставка їжі 3200 грн за місяць; тренування виконано 2 з 12 запланованих",
      ),
      judge: mentions(/трену|достав|їж/i, "звʼязок між модулями"),
    },
  ],
  candidates: [
    {
      provider: "anthropic",
      model: env.CHAT_MODEL_SYNTHESIS,
      label: "current default (premium tier)",
    },
    {
      provider: "anthropic",
      model: env.AI_PRO_STANDARD_CHAT_MODEL,
      label: "current standard tier",
    },
    {
      provider: "anthropic",
      model: env.AI_PRO_FLOOR_CHAT_MODEL,
      label: "current floor tier",
    },
  ],
};

const analysisPipeline: Pipeline = {
  // Пайплайн-дискримінатор. `chat` перевіряє, чи модель не ламається; цей —
  // чи вона щось РОЗУМІЄ. Різниця принципова: на простому переказі готових
  // цифр усі кандидати від найдорожчого до найдешевшого дали 18/18, тож
  // `chat` більше не здатен обґрунтувати жоден щабель тирингу.
  key: "analysis",
  label: "Chat analysis depth (tier discriminator)",
  system: SYSTEM_PREFIX,
  promptOrigin: "modules/chat/toolDefs/systemPrompt.ts::SYSTEM_PREFIX",
  maxTokens: 2500,
  judge: nonEmptyUkVerdict,
  checkVoice: true,
  cacheable: true,
  cases: [
    {
      name: "суперечливі дані",
      trap: "НЕПРАВИЛЬНО: переказати обидва числа й не помітити, що сума категорій 9310, а «разом» 12800 — 3490 грн невраховані.",
      user: synthesisTurn(
        "Куди пішли гроші цього місяця?",
        "aggregate_spending",
        "разом витрачено 12800 грн; продукти 5200 грн, транспорт 1310 грн, комуналка 2600 грн, підписки 200 грн",
      ),
      judge: mentions(
        /не сход|розбіж|решт|невідом|3490|не врахов|бракує|інше/i,
        "визнання розбіжності в сумах",
      ),
    },
    {
      name: "разовий сплеск",
      trap: "НЕПРАВИЛЬНО: порадити «скоротити витрати». Сплеск разовий (річний платіж), тож наступного місяця він не повториться — це не тренд.",
      user: synthesisTurn(
        "Чому цього місяця витрати такі великі?",
        "query_transactions",
        "страхування авто 18000 грн одним платежем 2026-07-03 (платіж річний); решта категорій на рівні попередніх місяців",
      ),
      judge: mentions(
        /разов|річн|не тренд|одноразов|наступн|не повтор/i,
        "позначку про разовість платежу",
      ),
    },
    {
      name: "пріоритезація",
      trap: "НЕПРАВИЛЬНО: перелічити три проблеми як рівноцінні. Борг 42 000 під 32% річних коштує ~1100 грн/міс — на порядок більше за підписки 340 грн/міс. Порада «почни з підписок» тут шкідлива, і саме її попередній суддя зарахував як правильну.",
      user: synthesisTurn(
        "З чого почати наводити лад у фінансах?",
        "get_daily_series",
        "кредитна картка: борг 42000 грн під 32% річних; підписки 340 грн/міс; їжа поза домом 4870 грн/міс; заощаджень немає",
      ),
      judge: mentions(
        /борг|картк|32|відсотк|насампер|першочерг|спершу/i,
        "пріоритет дорогого боргу",
      ),
    },
    {
      name: "крос-модульний звʼязок",
      trap: "НЕПРАВИЛЬНО: подати три ряди чисел окремо. Тренування падають у ті самі дні, коли витрати на доставку зростають — це один патерн.",
      user: synthesisTurn(
        "Що не так із моїм режимом?",
        "get_daily_series",
        "доставка їжі: пн-ср 0 грн, чт-нд 2800 грн; тренування: виконані пн-ср, пропущені чт-нд; сон: пн-ср 7.5 год, чт-нд 5.2 год",
      ),
      // «Патерн», «компенсуєш це доставкою», «тягне за собою» — це рівно
      // назване поєднання, лише без кореня «звʼяз». GLM-5.2 двічі отримав ❌
      // за відповідь, яка описувала звʼязок краще за ту, що пройшла.
      judge: mentions(
        /звʼяз|звʼяз|повʼяз|повʼяз|разом|одноча|коли|саме ті|ті самі|збіга|патерн|кореляц|компенс|тягне за собою|через це|призвод/i,
        "названий звʼязок між подіями",
      ),
    },
    {
      name: "хибна причинність",
      trap: "НЕПРАВИЛЬНО: порадити «менше таксі, щоб краще спати». Збіг у часі ≠ причина; у ці ж дні робочі зустрічі тривали до 21:00.",
      user: synthesisTurn(
        "Чому я погано сплю?",
        "get_daily_series",
        "дні з витратами на таксі після 22:00 (14 днів) збігаються з днями, коли сон < 6 год (13 з тих 14); також у ці дні робочі зустрічі тривали до 21:00",
      ),
      judge: mentions(
        /кореляц|збіг|не означа|не причин|пізн[іо] зустріч|робот|причина може/i,
        "розрізнення кореляції та причини",
      ),
    },
    {
      name: "дірка в даних",
      trap: "НЕПРАВИЛЬНО: подати середнє як факт. Воно пораховане на 20 днях із 31, тож занижене.",
      user: synthesisTurn(
        "Яка моя середня витрата на день?",
        "aggregate_spending",
        "сума 9600 грн за період 2026-07-01..2026-07-31; транзакції відсутні з 2026-07-08 по 2026-07-18 (імпорт банку не завершено)",
      ),
      judge: mentions(
        /неповн|відсутн|пропущ|дір|не врахов|20 дн|неточн|занижен|імпорт/i,
        "застереження про неповні дані",
      ),
    },
    {
      name: "неправдоподібне число",
      trap: "НЕПРАВИЛЬНО: додати 34 000 грн/міс на підписки в суму й порадити «скоротити». Серед звичайних чисел це майже напевно помилка даних (копійки замість гривень).",
      user: synthesisTurn(
        "Перевір мої регулярні платежі",
        "query_transactions",
        "оренда 12000 грн/міс; інтернет 250 грн/міс; підписки 34000 грн/міс; спортзал 800 грн/міс",
      ),
      judge: mentions(
        /помилк|схоже на|перевір|сумнів|нетипов|дивн|уточни|копійк|некоректн/i,
        "сумнів у некоректному записі",
      ),
    },
    {
      name: "недосяжна ціль",
      trap: "НЕПРАВИЛЬНО: схвалити план. Вільний залишок 2000 грн/міс, ціль 5000 — розрив треба назвати, а не підбадьорити.",
      user: synthesisTurn(
        "Хочу відкладати 5000 грн щомісяця, вийде?",
        "aggregate_spending",
        "дохід 28000 грн/міс; обовʼязкові витрати 26000 грн/міс (оренда, комуналка, продукти, транспорт); вільний залишок 2000 грн/міс",
      ),
      judge: mentions(
        /не вийде|недосяж|не вистач|розрив|2000|бракує|доведеться|лише 2/i,
        "визнання недосяжності цілі",
      ),
    },
  ],
  candidates: [
    {
      provider: "openrouter",
      model: "google/gemini-2.5-flash-lite",
      label: "baseline (standard-кандидат)",
    },
  ],
};

export const FINANCE_PIPELINES: Pipeline[] = [
  classifyPipeline,
  digestPipeline,
  monoPipeline,
  coachPipeline,
  chatPipeline,
  analysisPipeline,
];

/** Зразки даних — реекспорт для тесту паритету промптів. */
export const FIXTURES = {
  digestBase: DIGEST_BASE,
  monoCleanBatch: MONO_CLEAN_BATCH,
  monoDirtyBatch: MONO_DIRTY_BATCH,
  coachMemory: COACH_MEMORY,
};
