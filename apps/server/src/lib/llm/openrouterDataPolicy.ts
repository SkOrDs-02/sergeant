/**
 * Єдине джерело `provider`-преференцій для тіла запиту до OpenRouter.
 *
 * Рішення власника 2026-11-19: кожен запит сервера до шлюзу вимагає
 * постачальників, які НЕ зберігають дані користувача. У запитах фінанси й
 * дані про здоровʼя, а без поля `provider` шлюз обирає серед усіх
 * постачальників моделі, включно з тими, що зберігають запити й можуть на
 * них тренуватись (дефолт OpenRouter — `data_collection=allow`).
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
import type { OpenRouterDataCollection } from "../../env/aiRoutingEnv.js";
import { logger } from "../../obs/logger.js";

export interface OpenRouterProviderPrefs {
  data_collection: "deny";
  zdr?: true;
}

/**
 * `provider` для тіла запиту за поточним режимом. `undefined` означає «поля
 * не слати» (відкат `OPENROUTER_DATA_COLLECTION=allow`, поведінка до
 * 2026-11-19).
 *
 * Fail-closed: будь-яке значення, крім рівно `allow`, дає `deny`. Схема env
 * і так не пропускає іншого, але тестові моки env часто не мають цього поля
 * зовсім, і пропуск не має перетворюватись на дозвіл.
 */
export function openRouterProviderPrefs(
  mode: OpenRouterDataCollection | undefined = env.OPENROUTER_DATA_COLLECTION,
): OpenRouterProviderPrefs | undefined {
  if (mode === "allow") return undefined;
  return { data_collection: "deny" };
}

/**
 * ZDR + `deny` незалежно від відкату. Лише для Jev (TypeSafe): власник
 * погодив цього субпроцесора за умови ZDR, тож аварійний `allow` для решти
 * моделей не має знімати умову з нього.
 */
export function openRouterZdrProviderPrefs(): Required<OpenRouterProviderPrefs> {
  return { zdr: true, data_collection: "deny" };
}

/**
 * Повертає тіло з полем `provider` за поточним режимом. Тіло не мутується.
 * Якщо caller уже поклав свій `provider` (наприклад, `sort`), його поля
 * лишаються, а `data_collection` перекривається.
 */
export function withOpenRouterProviderPrefs<T extends Record<string, unknown>>(
  body: T,
  mode?: OpenRouterDataCollection,
): T {
  const prefs = openRouterProviderPrefs(mode ?? env.OPENROUTER_DATA_COLLECTION);
  if (!prefs) return body;
  const existing = body["provider"];
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...body, provider: { ...base, ...prefs } };
}

const DATA_POLICY_RE = /No endpoints found matching your data policy/i;

function errorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const error = (data as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

/**
 * 404 шлюзу саме через політику даних: для моделі не лишилось ендпойнта, що
 * задовольняє `provider`. Форми обох транспортів: `{error:{message}}`
 * (`/chat/completions`) і `{type:"error", error:{type, message}}`
 * (`/messages`).
 */
export function isOpenRouterDataPolicyRejection(
  status: number,
  data: unknown,
): boolean {
  if (status !== 404) return false;
  const message = errorMessage(data);
  return message !== undefined && DATA_POLICY_RE.test(message);
}

export interface DataPolicyRejectionContext {
  status: number;
  data: unknown;
  model: string;
  endpoint: string;
  transport: "messages" | "chat_completions";
}

/**
 * Пише окремий рядок у лог, коли шлюз відмовив через політику даних, і
 * повертає `true`. Нічого не ретраїть і на `allow` не перемикає: помилка
 * далі йде наявним шляхом помилок upstream. Лише модель, ендпойнт і режим:
 * ні тексту запиту, ні тексту відповіді (Hard Rule #21).
 */
export function noteOpenRouterDataPolicyRejection(
  ctx: DataPolicyRejectionContext,
): boolean {
  if (!isOpenRouterDataPolicyRejection(ctx.status, ctx.data)) return false;
  logger.warn({
    msg: "openrouter_data_policy_no_endpoints",
    model: ctx.model,
    endpoint: ctx.endpoint,
    transport: ctx.transport,
    status: ctx.status,
    dataCollection: openRouterProviderPrefs() ? "deny" : "allow",
  });
  return true;
}
