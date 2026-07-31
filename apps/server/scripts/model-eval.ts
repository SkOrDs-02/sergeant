#!/usr/bin/env node
/**
 * `pnpm eval:models` — model-routing re-benchmark harness.
 *
 * Context. `getLLMProvider()` (`src/lib/llm/provider.ts`) already lets every
 * pipeline swap models via env without a code change (see `docs/90-work/
 * planning/specs/model-routing-benchmark-pro-tier.md`). What was missing was
 * a repeatable way to compare candidate models on quality × cost × latency
 * across pipelines before flipping the env default in production.
 *
 * What this script does. For each pipeline below it sends a small golden
 * prompt to every candidate model through the SAME `getLLMProvider()` +
 * `invokeLLM()` path production code uses (no separate HTTP client), records
 * latency + token usage, runs a cheap heuristic pass/fail check, estimates
 * cost from the token-price table, and prints + writes a markdown table.
 *
 * Golden-set scope (v1, intentionally small — see spec § Ризики). Each
 * pipeline gets ONE representative prompt and a pass/fail heuristic, not a
 * full eval suite with human-rated quality scoring. This proves the harness
 * mechanism and benchmarks TODAY's known-good models; treat pass/fail as a
 * smoke signal, not a quality verdict — read the raw `text` column for that.
 *
 * Adding a new candidate WITHOUT a code change:
 *   pnpm eval:models -- --extra=digest:openrouter:some/new-model-id:short-label
 * (repeat --extra for multiple). Verify the model id against the live
 * OpenRouter catalog first — see spec § Ризики "OpenRouter model-id дрейф".
 *
 * Modes:
 *   pnpm eval:models                  # uses whatever ANTHROPIC_API_KEY /
 *                                      # OPENROUTER_API_KEY are in .env; with
 *                                      # neither set, getLLMProvider()
 *                                      # fail-softs to StubProvider (safe,
 *                                      # $0, proves the harness plumbing).
 *   pnpm eval:models -- --dry-run     # force StubProvider for every call —
 *                                      # explicit no-network / no-cost mode
 *                                      # (CI / sandboxed dev).
 *   pnpm eval:models -- --pipeline=digest,coach   # filter to a subset.
 *   pnpm eval:models -- --out=docs/90-work/planning/model-eval-2026-08-01.md
 *
 * Exit codes: 0 always (this is a report tool, not a gate) unless argument
 * parsing fails (1).
 */

import { parseArgs } from "node:util";
import process from "node:process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getLLMProvider,
  invokeLLM,
  type LLMProviderName,
} from "../src/lib/llm/provider.js";
import { env } from "../src/env/env.js";

interface Candidate {
  provider: Extract<LLMProviderName, "anthropic" | "openrouter">;
  model: string;
  label: string;
}

/**
 * One golden-set input. The system prompt is fixed per pipeline (production
 * ships exactly one), so a case varies only the user turn — that is where
 * real traffic actually differs. `judge` narrows the pipeline default when a
 * case has a sharper failure mode than "answered in Ukrainian at all".
 */
interface GoldenCase {
  name: string;
  user: string;
  judge?: (text: string) => boolean;
}

interface Pipeline {
  key: string;
  label: string;
  system: string;
  user: string;
  maxTokens: number;
  candidates: Candidate[];
  /** Cheap pass/fail smoke check — NOT a quality score. */
  judge: (text: string) => boolean;
  /** Golden set. Absent → the single `user` above runs as the only case. */
  cases?: GoldenCase[];
  /** Run VOICE_RULES on top of `judge` (user-facing pipelines only). */
  checkVoice?: boolean;
}

/**
 * Судді на голос — окремо від `judge`, бо міряють іншу вісь: `judge` питає
 * «чи відповідь по суті», голос — «чи вона написана як наш продукт».
 * Правила дзеркалять `VOICE_RULE` із системного промпта (v14).
 *
 * AI-DANGER: межі слова тут не декоративні. Наївний `/Ви|Ваш/` ловить
 * «Витрати», «Виявив», «Вашингтон» — а це якраз ті слова, які модель пише
 * найчастіше. Лишай lookaround-и на `\p{L}` з обох боків.
 */
const VOICE_RULES: ReadonlyArray<{ id: string; violation: RegExp }> = [
  {
    id: "Ви",
    violation:
      /(?<!\p{L})(ви|вам|вас|вами|ваш(?:а|е|і|ого|ому|им|ими|их|ій|ої|у|ою)?)(?!\p{L})/iu,
  },
  { id: "емодзі", violation: /\p{Extended_Pictographic}/u },
  {
    // Нумерований список `1.` — теж розмітка: `AssistantMessageBody` рендерить
    // його як <ol>, а мобільний показує сирим. Без цієї гілки суддя пропускав
    // найчастішу з реальних відповідей форму — перелік кроків.
    id: "markdown",
    violation:
      /\*\*|__|`|^\s*[-*+]\s|^\s*\d+\.\s|^\s*#{1,6}\s|\[[^\]]+\]\([^)]+\)/m,
  },
  {
    // `z-ai/glm-4.7-flash` видав «За цей місяць МІЙ баланс вийшов від'ємним» —
    // застосував правило 1-ї особи до грошей користувача. Решта суддів це
    // пропускала: «Ви» немає, емодзі немає, розмітки немає. Присвійні
    // займенники 1-ї особи асистент не має права вживати про чужі дані;
    // «я можу», «мені потрібно» лишаються дозволеними, бо це не присвійність.
    id: "чужа особа",
    violation:
      /(?<!\p{L})(мій|моя|моє|мої|мого|моєї|моїх|моїм|моєму)(?!\p{L})/iu,
  },
];

/** Порушені правила голосу; порожній масив = чисто. */
function voiceViolations(text: string): string[] {
  return VOICE_RULES.filter((r) => r.violation.test(text)).map((r) => r.id);
}

/**
 * Складає репліку так, як її бачить етап синтезу в проді: питання користувача
 * плюс УЖЕ отримані результати інструмента в тому самому envelope, що ставить
 * `wrapAndScanToolResults` (`<tool_output tool="…">`).
 *
 * AI-CONTEXT: без envelope голден-сет подавав самі цифри — і модель читала їх
 * як прохання щось записати. Звідси бралися відповіді «Записую транзакцію…» і
 * навіть сирий `<tool_call>{…}` у видимому тексті: промпт каже «для запису
 * виклич інструмент», інструментів стенд не передає, тож модель писала виклик
 * прозою. Синтез за визначенням іде ПІСЛЯ інструментів — репліка має це
 * показувати, інакше стенд міряє не той крок конвеєра.
 */
function synthesisTurn(question: string, tool: string, output: string): string {
  return `${question}\n\n<tool_output tool="${tool}">${output}</tool_output>`;
}

const nonEmptyUk = (text: string): boolean =>
  text.trim().length > 3 && /[Ѐ-ӿ]/.test(text);

/** Guards the worst failure on empty input: inventing amounts that do not exist. */
const noInventedAmounts = (text: string): boolean =>
  nonEmptyUk(text) && !/\d{3,}/.test(text);

const mentions = (re: RegExp) => (text: string) =>
  nonEmptyUk(text) && re.test(text);

const oneOf = (options: string[]) => (text: string) =>
  options.includes(
    text
      .trim()
      .toLowerCase()
      .replace(/[."'\s]/g, ""),
  );

// Model-eval 2026-07 defaults — today's known-good models already wired
// through env.ts. Extend via --extra rather than hardcoding tomorrow's
// unverified OpenRouter ids here (see file-header note).
const PIPELINES: Pipeline[] = [
  {
    key: "classify",
    label: "Finyk classify (cheap-router)",
    system:
      "Класифікуй повідомлення користувача в одну з категорій: chat, tool_use, question. Відповідай ЛИШЕ одним словом, без пунктуації.",
    user: "Онови мій бюджет на харчування до 5000 грн цього місяця.",
    maxTokens: 10,
    judge: oneOf(["chat", "tool_use", "question"]),
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
  },
  {
    key: "digest",
    label: "Weekly-digest AI-commentary",
    system:
      "Ти фінансовий аналітик. Дай короткий коментар (1-2 речення) українською до наведених даних тижня.",
    user: "Витрати: 4500 грн (+12% до попереднього тижня). Дохід: 25000 грн.",
    maxTokens: 150,
    judge: nonEmptyUk,
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
  },
  {
    key: "chat",
    label: "Chat tool-result synthesis",
    system:
      "Ти персональний фінансовий помічник. Дай коротку пораду (1 речення) українською на основі підсумку.",
    user: synthesisTurn(
      "Скільки я цього тижня витратив на каву?",
      "query_transactions",
      "8 транзакцій, разом 960 грн, категорія «їжа поза домом», остання 2026-07-29 на 120 грн",
    ),
    maxTokens: 150,
    judge: nonEmptyUk,
    checkVoice: true,
    cases: [
      {
        name: "проста порада",
        user: synthesisTurn(
          "Скільки я цього тижня витратив на каву?",
          "query_transactions",
          "8 транзакцій, разом 960 грн, категорія «їжа поза домом», остання 2026-07-29 на 120 грн",
        ),
      },
      {
        name: "багато категорій",
        user: synthesisTurn(
          "Покажи мої витрати за липень",
          "aggregate_spending",
          "продукти 8420 грн, транспорт 1310 грн, їжа поза домом 4870 грн, комуналка 2600 грн, підписки 890 грн; дохід 32000 грн",
        ),
        judge: mentions(/продукт|їж|поза домом/i),
      },
      {
        name: "порожні дані",
        user: synthesisTurn(
          "Як мої фінанси цього тижня?",
          "query_transactions",
          "транзакцій не знайдено; бюджет не налаштований",
        ),
        judge: noInventedAmounts,
      },
      {
        name: "перевитрата",
        user: synthesisTurn(
          "Як у мене з бюджетом цього місяця?",
          "aggregate_spending",
          "витрати 34200 грн, дохід 28000 грн; третій місяць поспіль витрати перевищують дохід",
        ),
        judge: mentions(/перевищ|більше|мінус|борг|скороти|дефіцит/i),
      },
      {
        name: "порівняння періодів",
        user: synthesisTurn(
          "Порівняй їжу поза домом з минулим місяцем",
          "compare_periods",
          "їжа поза домом: липень 4870 грн, червень 2100 грн; решта категорій без змін",
        ),
        judge: mentions(/зрос|вирос|збільш|вдвіч|більш|рази?а?\b/i),
      },
      {
        name: "крос-модульний",
        user: synthesisTurn(
          "Як у мене з фінансами й тренуваннями?",
          "get_daily_series",
          "доставка їжі 3200 грн за місяць; тренування виконано 2 з 12 запланованих",
        ),
        judge: mentions(/трену|достав|їж/i),
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
  },
  {
    // Пайплайн-дискримінатор. `chat` перевіряє, чи модель не ламається; цей —
    // чи вона щось РОЗУМІЄ. Різниця принципова: на простому переказі готових
    // цифр усі кандидати від найдорожчого до найдешевшого дали 18/18, тож
    // `chat` більше не здатен обґрунтувати жоден щабель тирингу.
    //
    // Кожен кейс має пастку, у яку слабка модель падає, переказуючи вхідні
    // дані замість висновку. Евристичний суддя ловить лише грубий промах —
    // рішення про якість аналізу ухвалюється читанням колонки `sample`.
    key: "analysis",
    label: "Chat analysis depth (tier discriminator)",
    system:
      "Ти персональний фінансовий помічник. Проаналізуй дані й дай висновок українською (2-4 речення).",
    user: "",
    maxTokens: 2500,
    judge: nonEmptyUk,
    checkVoice: true,
    cases: [
      {
        // Пастка: сума категорій 9310, а «разом» 12800 — 3490 грн невраховані.
        // Слабка модель перекаже обидва числа й не помітить розбіжності.
        name: "суперечливі дані",
        user: synthesisTurn(
          "Куди пішли гроші цього місяця?",
          "aggregate_spending",
          "разом витрачено 12800 грн; продукти 5200 грн, транспорт 1310 грн, комуналка 2600 грн, підписки 200 грн",
        ),
        judge: mentions(
          /не сход|розбіж|решт|невідом|3490|не врахов|бракує|інше/i,
        ),
      },
      {
        // Пастка: сплеск разовий (річний платіж), тож «скороти витрати» —
        // хибна порада. Правильно: це не тренд, наступного місяця впаде.
        name: "разовий сплеск",
        user: synthesisTurn(
          "Чому цього місяця витрати такі великі?",
          "query_transactions",
          "страхування авто 18000 грн одним платежем 2026-07-03 (платіж річний); решта категорій на рівні попередніх місяців",
        ),
        judge: mentions(/разов|річн|не тренд|одноразов|наступн|не повтор/i),
      },
      {
        // Пастка: три проблеми різної ваги. Борг під 32% річних коштує
        // ~1100 грн/міс — на порядок більше за підписки. Слабка модель
        // перелічить усі три як рівноцінні.
        name: "пріоритезація",
        user: synthesisTurn(
          "З чого почати наводити лад у фінансах?",
          "get_daily_series",
          "кредитна картка: борг 42000 грн під 32% річних; підписки 340 грн/міс; їжа поза домом 4870 грн/міс; заощаджень немає",
        ),
        judge: mentions(/борг|картк|32|відсотк|насампер|першочерг|спершу/i),
      },
      {
        // Пастка: зв'язок між модулями. Тренування падають у ті самі дні,
        // коли витрати на доставку зростають — це один патерн, не три числа.
        name: "крос-модульний звʼязок",
        user: synthesisTurn(
          "Що не так із моїм режимом?",
          "get_daily_series",
          "доставка їжі: пн-ср 0 грн, чт-нд 2800 грн; тренування: виконані пн-ср, пропущені чт-нд; сон: пн-ср 7.5 год, чт-нд 5.2 год",
        ),
        judge: mentions(
          /звʼяз|зв'яз|пов'яз|повʼяз|разом|одноча|коли|саме ті|збіга/i,
        ),
      },
      {
        // Пастка: збіг у часі ≠ причина. Сильна модель назве це кореляцією і
        // не порадить «менше таксі, щоб краще спати».
        name: "хибна причинність",
        user: synthesisTurn(
          "Чому я погано сплю?",
          "get_daily_series",
          "дні з витратами на таксі після 22:00 (14 днів) збігаються з днями, коли сон < 6 год (13 з тих 14); також у ці дні робочі зустрічі тривали до 21:00",
        ),
        judge: mentions(
          /кореляц|збіг|не означа|не причин|пізн[іо] зустріч|робот|причина може/i,
        ),
      },
      {
        // Пастка: дірка в даних. Середнє «за місяць» пораховане на 20 днях,
        // тож воно занижене. Слабка модель подасть його як факт.
        name: "дірка в даних",
        user: synthesisTurn(
          "Яка моя середня витрата на день?",
          "aggregate_spending",
          "сума 9600 грн за період 2026-07-01..2026-07-31; транзакції відсутні з 2026-07-08 по 2026-07-18 (імпорт банку не завершено)",
        ),
        judge: mentions(
          /неповн|відсутн|пропущ|дір|не врахов|20 дн|неточн|занижен|імпорт/i,
        ),
      },
      {
        // Пастка: 34000 грн/міс на підписки серед звичайних чисел — майже
        // напевно помилка даних (копійки замість гривень). Сильна модель
        // засумнівається, слабка додасть це в суму і порадить «скоротити».
        name: "неправдоподібне число",
        user: synthesisTurn(
          "Перевір мої регулярні платежі",
          "query_transactions",
          "оренда 12000 грн/міс; інтернет 250 грн/міс; підписки 34000 грн/міс; спортзал 800 грн/міс",
        ),
        judge: mentions(
          /помилк|схоже на|перевір|сумнів|нетипов|дивн|уточни|копійк|некоректн/i,
        ),
      },
      {
        // Пастка: ціль недосяжна за поточних вхідних. Слабка модель схвалить
        // план; сильна назве розрив і що саме треба змінити.
        name: "недосяжна ціль",
        user: synthesisTurn(
          "Хочу відкладати 5000 грн щомісяця, вийде?",
          "aggregate_spending",
          "дохід 28000 грн/міс; обов'язкові витрати 26000 грн/міс (оренда, комуналка, продукти, транспорт); вільний залишок 2000 грн/міс",
        ),
        judge: mentions(
          /не вийде|недосяж|не вистач|розрив|2000|бракує|доведеться|лише 2/i,
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
  },
  {
    key: "coach",
    label: "Coach proactive daily insight",
    system:
      "Ти персональний AI-коуч. Сформулюй ОДНЕ коротке проактивне повідомлення дня (2-3 речення) українською, тепло але конкретно.",
    user: "Цього тижня: 3 тренування (звичайно 4), витрати на 15% нижчі за середні, 2 звички виконано з 3.",
    maxTokens: 300,
    judge: nonEmptyUk,
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
  },
  {
    key: "nutrition",
    label: "Nutrition day-hint",
    system:
      "Ти нутриціолог-помічник. Запропонуй одну коротку пораду щодо харчування українською (1-2 речення).",
    user: "Сьогодні: 1800 ккал, білка 60г. Ціль: 2200 ккал, 120г білка.",
    maxTokens: 150,
    judge: nonEmptyUk,
    candidates: [
      {
        provider: "anthropic",
        model: env.NUTRITION_MODEL,
        label: "current default (Anthropic)",
      },
      {
        provider: "openrouter",
        model: "google/gemini-2.5-flash-lite",
        label: "OpenRouter Gemini Flash Lite",
      },
    ],
  },
  {
    key: "mono",
    label: "Mono/Finyk MCC batch-enrichment",
    system:
      "Класифікуй категорію транзакції за описом. Відповідай ОДНИМ словом: groceries, transport, dining, other.",
    user: "Опис: Сільпо, MCC 5411.",
    maxTokens: 10,
    judge: oneOf(["groceries", "transport", "dining", "other"]),
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
  },
];

// USD / 1M tokens (input, output). Point-in-time snapshot — reverify against
// provider pricing pages before trusting cost columns; unknown model ids
// fall back to `null` (cost column prints "?").
const PRICE_PER_1M: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "google/gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "openai/gpt-5.1": { input: 1.25, output: 10 },
  // OpenRouter candidates priced from the live catalog (2026-07-20). Reverify
  // before trusting — provider prices drift. Thinking models (kimi*, glm-5*,
  // qwen3.7*) answer normally once `--max-tokens` matches production (chat
  // synthesis runs at 2500); the earlier "returns empty" reading came from the
  // 150-token default, which they spend entirely on hidden reasoning. They are
  // still a poor fit here — hundreds of thinking tokens and 6–35 s of latency
  // for a one-sentence answer — but the failure is economic, not functional.
  "anthropic/claude-sonnet-4.6": { input: 3, output: 15 },
  "anthropic/claude-haiku-4.5": { input: 1, output: 5 },
  "google/gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "deepseek/deepseek-v3.2": { input: 0.269, output: 0.4 },
  "deepseek/deepseek-v4-flash": { input: 0.098, output: 0.196 },
  "z-ai/glm-4.7-flash": { input: 0.061, output: 0.4 },
  "z-ai/glm-5.2": { input: 0.974, output: 3.062 },
  "qwen/qwen3.5-flash-02-23": { input: 0.07, output: 0.26 },
  "qwen/qwen3.7-plus": { input: 0.32, output: 1.28 },
  "moonshotai/kimi-k2.6": { input: 0.684, output: 3.42 },
  "moonshotai/kimi-k3": { input: 3, output: 15 },
};

interface RunResult {
  pipeline: string;
  caseName: string;
  candidate: Candidate;
  ok: boolean;
  passedJudge: boolean;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  text: string;
  /** `null` — пайплайн не user-facing, голос не міряємо. */
  voiceFails: string[] | null;
  error?: string;
}

/**
 * Ціни, підтягнуті з живого каталогу OpenRouter на старті прогону.
 *
 * AI-CONTEXT: статична `PRICE_PER_1M` систематично протухала — прайси
 * дрейфують, нові моделі виходять щотижня, і колонка вартості мовчки
 * показувала `?` або застарілу цифру там, де на ній будувалося рішення про
 * заміну моделі. Каталог публічний і не потребує ключа, тож живі ціни
 * коштують один GET. Таблиця лишається фолбеком для не-OpenRouter id
 * (`claude-sonnet-4-6` та інші прямі Anthropic-імена) і для offline/dry-run.
 */
const livePrices = new Map<string, { input: number; output: number }>();

async function loadLivePrices(): Promise<void> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models");
    if (!response.ok) return;
    const body = (await response.json()) as {
      data?: Array<{
        id?: string;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    for (const model of body.data ?? []) {
      if (!model.id) continue;
      const input = Number(model.pricing?.prompt) * 1_000_000;
      const output = Number(model.pricing?.completion) * 1_000_000;
      if (Number.isFinite(input) && Number.isFinite(output) && input > 0) {
        livePrices.set(model.id, { input, output });
      }
    }
  } catch {
    /* каталог недоступний — лишаємось на статичній таблиці */
  }
}

function estimateCost(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  const price = livePrices.get(model) ?? PRICE_PER_1M[model];
  if (!price || inputTokens == null || outputTokens == null) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

async function runOne(
  pipeline: Pipeline,
  goldenCase: GoldenCase,
  candidate: Candidate,
  dryRun: boolean,
): Promise<RunResult> {
  const provider = getLLMProvider({
    provider: dryRun ? "stub" : candidate.provider,
    stubResponse: { text: "stub" },
  });
  const t0 = Date.now();
  const result = await invokeLLM(provider, {
    model: candidate.model,
    system: pipeline.system,
    messages: [{ role: "user", content: goldenCase.user }],
    maxTokens: pipeline.maxTokens,
    endpoint: `internal/model-eval/${pipeline.key}`,
    timeoutMs: 60_000,
  });
  const latencyMs = Date.now() - t0;

  if (!result.ok) {
    return {
      pipeline: pipeline.key,
      caseName: goldenCase.name,
      candidate,
      ok: false,
      passedJudge: false,
      latencyMs,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      text: "",
      voiceFails: null,
      error: `${result.code ?? "error"}: ${result.error}`,
    };
  }

  const inputTokens = result.usage?.inputTokens ?? null;
  const outputTokens = result.usage?.outputTokens ?? null;
  return {
    pipeline: pipeline.key,
    caseName: goldenCase.name,
    candidate,
    ok: true,
    passedJudge: (goldenCase.judge ?? pipeline.judge)(result.text),
    latencyMs,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(candidate.model, inputTokens, outputTokens),
    // Голос міряємо на сирому тексті: `\n` і `|` вирізаються нижче заради
    // markdown-таблиці звіту, а саме вони — сигнал для правила про списки.
    voiceFails: pipeline.checkVoice ? voiceViolations(result.text) : null,
    text: result.text.replace(/\n|\|/g, " ").slice(0, 200),
  };
}

function fmtCost(v: number | null): string {
  if (v == null) return "?";
  return `$${(v * 1000).toFixed(4)}/1k`;
}

function toMarkdown(results: RunResult[], generatedAt: string): string {
  const lines: string[] = [
    "# Model-eval report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Pass/fail is a cheap heuristic smoke-check per pipeline, not a human-rated",
    "quality score — read the `sample` column and re-run with real traffic",
    "before trusting a candidate blindly. Cost is estimated from a point-in-time",
    "price table in `model-eval.ts` — reverify before committing to a swap.",
    "The `Voice` column mirrors `VOICE_RULE` from the v14 system prompt (звертання",
    "«ти», без емодзі, без markdown); `—` means the pipeline is not user-facing.",
    "",
    "## Summary per candidate",
    "",
    "| Candidate | Model | Passed | Voice | Median latency (ms) | Avg cost |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  // Median, not mean: one 35-second reasoning outlier would otherwise hide a
  // candidate that is fast on every other case.
  const byCandidate = new Map<string, RunResult[]>();
  for (const r of results) {
    const key = `${r.candidate.label}\u0000${r.candidate.model}`;
    const bucket = byCandidate.get(key);
    if (bucket) bucket.push(r);
    else byCandidate.set(key, [r]);
  }
  for (const [, rows] of byCandidate) {
    const first = rows[0];
    if (!first) continue;
    const passed = rows.filter((r) => r.passedJudge).length;
    const sorted = [...rows].map((r) => r.latencyMs).sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const costs = rows
      .map((r) => r.costUsd)
      .filter((c): c is number => c != null);
    const avgCost = costs.length
      ? costs.reduce((a, b) => a + b, 0) / costs.length
      : null;
    const voiced = rows.filter((r) => r.voiceFails !== null);
    const voiceCell = voiced.length
      ? `${voiced.filter((r) => r.voiceFails?.length === 0).length}/${voiced.length}`
      : "—";
    lines.push(
      `| ${first.candidate.label} | \`${first.candidate.model}\` | ${passed}/${rows.length} | ${voiceCell} | ${mid} | ${fmtCost(avgCost)} |`,
    );
  }

  lines.push(
    "",
    "## Per-case detail",
    "",
    "| Pipeline | Case | Candidate | Model | OK | Judge | Voice | Latency (ms) | In tok | Out tok | Est. cost | Sample |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const r of results) {
    const voiceCell =
      r.voiceFails === null
        ? "—"
        : r.voiceFails.length === 0
          ? "✅"
          : `❌ ${r.voiceFails.join(", ")}`;
    lines.push(
      `| ${r.pipeline} | ${r.caseName} | ${r.candidate.label} | \`${r.candidate.model}\` | ${r.ok ? "✅" : "❌"} | ${r.passedJudge ? "✅" : "❌"} | ${voiceCell} | ${r.latencyMs} | ${r.inputTokens ?? "?"} | ${r.outputTokens ?? "?"} | ${fmtCost(r.costUsd)} | ${r.error ?? r.text} |`,
    );
  }
  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      pipeline: { type: "string" },
      out: { type: "string" },
      extra: { type: "string", multiple: true, default: [] },
      "max-tokens": { type: "string" },
      "real-system-prompt": { type: "boolean", default: false },
      repeat: { type: "string" },
    },
  });

  // The built-in chat `system` is a one-line stand-in. Production ships
  // SYSTEM_PREFIX (v14) — module tool list, voice rules, advice boundary,
  // tool-output injection guard. The stand-in carries none of them, so the
  // Voice column is only meaningful together with --real-system-prompt.
  if (values["real-system-prompt"]) {
    const { SYSTEM_PREFIX } =
      await import("../src/modules/chat/toolDefs/systemPrompt.js");
    // Патчимо ВСІ user-facing пайплайни, не лише `chat`: `analysis` теж
    // віддає текст користувачеві, і без реального префікса його правила
    // голосу не діють — судді тоді міряють промпт-заглушку, а не прод.
    for (const pipeline of PIPELINES) {
      if (pipeline.checkVoice) pipeline.system = SYSTEM_PREFIX;
    }
  }

  // Reasoning models spend their budget on hidden thinking tokens before
  // emitting any content, so a tight cap reads as "returned empty" when the
  // model is merely slow to start. Production chat synthesis runs at 2500
  // (`chat.ts`), so compare candidates at the budget they will actually get.
  const maxTokensOverride = values["max-tokens"]
    ? Number(values["max-tokens"])
    : null;
  if (maxTokensOverride !== null && !Number.isFinite(maxTokensOverride)) {
    console.error(`Invalid --max-tokens="${values["max-tokens"]}"`);
    process.exitCode = 1;
    return;
  }

  const filter = values.pipeline
    ? new Set(values.pipeline.split(",").map((s) => s.trim()))
    : null;
  const pipelines = filter
    ? PIPELINES.filter((p) => filter.has(p.key))
    : PIPELINES;

  for (const raw of values.extra ?? []) {
    const [key, provider, model, label] = raw.split(":");
    const pipeline = pipelines.find((p) => p.key === key);
    if (
      !pipeline ||
      (provider !== "anthropic" && provider !== "openrouter") ||
      !model
    ) {
      console.error(
        `Ignoring malformed --extra="${raw}" (expected pipeline:provider:model[:label])`,
      );
      continue;
    }
    pipeline.candidates.push({
      provider,
      model,
      label: label ?? "extra candidate",
    });
  }

  const repeats = Math.max(1, Number(values.repeat ?? 1) || 1);
  if (values["dry-run"] !== true) await loadLivePrices();
  const results: RunResult[] = [];
  for (const pipeline of pipelines) {
    if (maxTokensOverride !== null) pipeline.maxTokens = maxTokensOverride;
    const cases = pipeline.cases ?? [{ name: "default", user: pipeline.user }];
    for (const goldenCase of cases) {
      for (const candidate of pipeline.candidates) {
        // Повтори підряд, а не окремими прогонами: один запуск — одна таблиця,
        // і розкид видно в ній, а не при ручному зведенні кількох звітів.
        for (let i = 0; i < repeats; i += 1) {
          results.push(
            await runOne(
              pipeline,
              goldenCase,
              candidate,
              values["dry-run"] === true,
            ),
          );
        }
      }
    }
  }

  const generatedAt = new Date().toISOString();
  const markdown = toMarkdown(results, generatedAt);
  console.log(markdown);

  // `scripts/` sits at apps/server/scripts — three levels below the repo
  // root. Resolve output paths against the repo root (not cwd, which pnpm
  // sets to apps/server) so `--out=docs/...` matches the usage examples.
  const repoRoot = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../..",
  );
  const outPath =
    values.out ??
    `docs/90-work/planning/model-eval-${generatedAt.slice(0, 10)}.md`;
  const absOutPath = resolve(repoRoot, outPath);
  mkdirSync(dirname(absOutPath), { recursive: true });
  writeFileSync(absOutPath, markdown, "utf-8");
  console.log(`\nWritten to ${absOutPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
