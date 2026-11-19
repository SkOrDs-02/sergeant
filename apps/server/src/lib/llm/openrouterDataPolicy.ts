/**
 * Єдине джерело `provider`-преференцій для тіла запиту до OpenRouter.
 *
 * Рішення власника 2026-11-19: кожен запит сервера до шлюзу вимагає
 * постачальників, які НЕ зберігають дані користувача. У запитах фінанси й
 * дані про здоровʼя, а без поля `provider` шлюз обирає серед усіх
 * постачальників моделі, включно з тими, що зберігають запити й можуть на
 * них тренуватись (дефолт OpenRouter — `data_collection=allow`).
 *
 * Друге рішення власника того ж дня: постачальники з квантизацією не нижче
 * 8 біт (`provider.quantizations`). Підстава — замір
 * `docs/work/research/2026-11-19-openrouter-new-models.md` § 6.2: на
 * `relace/fp4` `deepseek/deepseek-v4-flash` давав російську в 16 з 37
 * відповідей, без 4-бітних ендпойнтів 0 з 79. Список (а не `ignore`
 * конкретного постачальника) ловить і майбутні стиснені варіанти.
 *
 * AI-CONTEXT: чому `data_collection=deny`, а не `zdr: true`. ZDR суворіший
 * (нуль зберігання навіть транзитно), але живі проби 2026-11-19 показали:
 * під `zdr: true` у `google/gemini-2.5-flash-lite` не лишається жодного
 * ендпойнта — шлюз віддає 404 «No endpoints found matching your data policy
 * (Zero data retention)», і на обох транспортах (`/chat/completions` і
 * Anthropic-сумісний `/messages`). На цій моделі шість пайплайнів: зір
 * нутриції, чеки, імпорт виписок, нутриція, дайджест, Mono і категоризація.
 * Під `data_collection=deny` кожна прод-модель має хоч один ендпойнт
 * (заміряно того ж дня). Тому ZDR тут лише для Jev
 * (`openRouterZdrProviderPrefs`), де власник погодив субпроцесора саме за
 * умови ZDR.
 *
 * Хелпер стоїть у двох транспортах (`lib/anthropic.ts` для `/messages`,
 * `lib/llm/provider.ts` для `/chat/completions`) і в стендах, що будують тіло
 * самі. Повноту стереже `lib/openrouterDataPolicyCoverage.test.ts`: новий
 * файл із виходом в OpenRouter без цього хелпера валить тест.
 *
 * Прямий Anthropic (`LLM_FALLBACK_ENABLED`, `CHAT_VIA_OPENROUTER=false`),
 * Groq і Voyage поля не отримують: це параметр OpenRouter.
 */
import { env } from "../../env.js";
import type {
  OpenRouterDataCollection,
  OpenRouterQuantizationFloor,
} from "../../env/aiRoutingEnv.js";
import { logger } from "../../obs/logger.js";

/**
 * Рівні квантизації від 8 біт для `provider.quantizations`.
 *
 * AI-CONTEXT: `unknown` обовʼязковий. У пропрієтарних моделей (Google,
 * Anthropic) квантизація ендпойнтів не заявлена, і без `unknown` живі проби
 * 2026-11-19 дали 404 для `google/gemini-3.7-flash`,
 * `anthropic/claude-sonnet-4.6` і `google/gemini-2.5-flash-lite`. Ціна
 * компромісу: ендпойнт відкритої моделі, що не заявив квантизацію, теж
 * пройде. `int8` не входить: так зафіксовано рішенням власника (список
 * проб 2026-11-19).
 */
export const OPENROUTER_MIN_8BIT_QUANTIZATIONS = [
  "fp8",
  "mxfp8",
  "fp16",
  "bf16",
  "fp32",
  "unknown",
] as const;

export type OpenRouterQuantization =
  (typeof OPENROUTER_MIN_8BIT_QUANTIZATIONS)[number];

export interface OpenRouterProviderPrefs {
  data_collection?: "deny";
  quantizations?: OpenRouterQuantization[];
  zdr?: true;
}

/** Fail-closed: усе, крім рівно `off`, дає межу 8 біт. */
function quantizationsFor(
  floor: OpenRouterQuantizationFloor | undefined,
): Pick<OpenRouterProviderPrefs, "quantizations"> {
  if (floor === "off") return {};
  return { quantizations: [...OPENROUTER_MIN_8BIT_QUANTIZATIONS] };
}

/**
 * `provider` для тіла запиту за поточними режимами. Два перемикачі
 * незалежні: `OPENROUTER_DATA_COLLECTION=allow` прибирає лише
 * `data_collection`, `OPENROUTER_QUANTIZATION_FLOOR=off` — лише
 * `quantizations`. `undefined` означає «поля не слати» (обидва відкати,
 * поведінка до 2026-11-19).
 *
 * Fail-closed: будь-яке значення, крім рівно `allow`/`off`, дає `deny`/`fp8`.
 * Схема env і так не пропускає іншого, але тестові моки env часто не мають
 * цих полів зовсім, і пропуск не має перетворюватись на дозвіл.
 */
export function openRouterProviderPrefs(
  mode: OpenRouterDataCollection | undefined = env.OPENROUTER_DATA_COLLECTION,
  floor:
    OpenRouterQuantizationFloor | undefined = env.OPENROUTER_QUANTIZATION_FLOOR,
): OpenRouterProviderPrefs | undefined {
  const prefs: OpenRouterProviderPrefs = {
    ...(mode === "allow" ? {} : { data_collection: "deny" as const }),
    ...quantizationsFor(floor),
  };
  return Object.keys(prefs).length > 0 ? prefs : undefined;
}

/**
 * ZDR + `deny` незалежно від відкату даних. Лише для Jev (TypeSafe):
 * власник погодив цього субпроцесора за умови ZDR, тож аварійний `allow` для
 * решти моделей не має знімати умову з нього. Квантизація йде за спільним
 * перемикачем, як і в усіх інших запитах.
 */
export function openRouterZdrProviderPrefs(
  floor:
    OpenRouterQuantizationFloor | undefined = env.OPENROUTER_QUANTIZATION_FLOOR,
): OpenRouterProviderPrefs & { zdr: true; data_collection: "deny" } {
  return { zdr: true, data_collection: "deny", ...quantizationsFor(floor) };
}

/**
 * Повертає тіло з полем `provider` за поточними режимами. Тіло не мутується.
 * Якщо caller уже поклав свій `provider` (наприклад, `sort`), його поля
 * лишаються, а `data_collection` перекривається.
 *
 * Виняток для квантизації: якщо caller явно передав `quantizations` або
 * `ignore` (це робить лише стенд `eval:models --provider-prefs`), дефолтний
 * список НЕ додається і не перекриває його вибір, інакше стенд не зміг би
 * міряти інші варіанти. Прод цих полів не передає.
 */
export function withOpenRouterProviderPrefs<T extends Record<string, unknown>>(
  body: T,
  mode?: OpenRouterDataCollection,
  floor?: OpenRouterQuantizationFloor,
): T {
  const prefs = openRouterProviderPrefs(
    mode ?? env.OPENROUTER_DATA_COLLECTION,
    floor ?? env.OPENROUTER_QUANTIZATION_FLOOR,
  );
  if (!prefs) return body;
  const existing = body["provider"];
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  const { quantizations, ...rest } = prefs;
  const callerChoseRouting = "quantizations" in base || "ignore" in base;
  const merged = {
    ...base,
    ...rest,
    ...(quantizations && !callerChoseRouting ? { quantizations } : {}),
  };
  return { ...body, provider: merged };
}

const DATA_POLICY_RE = /No endpoints found matching your data policy/i;
const QUANTIZATION_RE = /No endpoints found for the request with quantization/i;

/** Чому шлюз не знайшов ендпойнта під наші `provider`-поля. */
export type OpenRouterNoEndpointsReason = "data_policy" | "quantization";

function errorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const error = (data as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

/**
 * Причина 404 шлюзу, коли для моделі не лишилось ендпойнта під наші
 * `provider`-поля: політика даних (`data_collection`/`zdr`) чи квантизація.
 * Форми обох транспортів: `{error:{message}}` (`/chat/completions`) і
 * `{type:"error", error:{type, message}}` (`/messages`). Будь-яка інша
 * помилка — `undefined`.
 */
export function openRouterNoEndpointsReason(
  status: number,
  data: unknown,
): OpenRouterNoEndpointsReason | undefined {
  if (status !== 404) return undefined;
  const message = errorMessage(data);
  if (message === undefined) return undefined;
  if (DATA_POLICY_RE.test(message)) return "data_policy";
  if (QUANTIZATION_RE.test(message)) return "quantization";
  return undefined;
}

/** 404 шлюзу через будь-яке з наших `provider`-обмежень. */
export function isOpenRouterDataPolicyRejection(
  status: number,
  data: unknown,
): boolean {
  return openRouterNoEndpointsReason(status, data) !== undefined;
}

export interface DataPolicyRejectionContext {
  status: number;
  data: unknown;
  model: string;
  endpoint: string;
  transport: "messages" | "chat_completions";
}

/**
 * Пише окремий рядок у лог, коли шлюз відмовив через наші `provider`-поля, і
 * повертає `true`. Подія одна (`openrouter_data_policy_no_endpoints`, імʼя
 * лишилось від першого рішення), причину розводить поле `reason`:
 * `data_policy` або `quantization`. Нічого не ретраїть і на відкат не
 * перемикає: помилка далі йде наявним шляхом помилок upstream. Лише модель,
 * ендпойнт, причина й режими: ні тексту запиту, ні тексту відповіді (Hard
 * Rule #21).
 */
export function noteOpenRouterDataPolicyRejection(
  ctx: DataPolicyRejectionContext,
): boolean {
  const reason = openRouterNoEndpointsReason(ctx.status, ctx.data);
  if (!reason) return false;
  const prefs = openRouterProviderPrefs();
  logger.warn({
    msg: "openrouter_data_policy_no_endpoints",
    reason,
    model: ctx.model,
    endpoint: ctx.endpoint,
    transport: ctx.transport,
    status: ctx.status,
    dataCollection: prefs?.data_collection ? "deny" : "allow",
    quantizationFloor: prefs?.quantizations ? "fp8" : "off",
  });
  return true;
}
