/**
 * `pnpm eval:tools:jev` - замір Jev на розмітці стенду вибору інструментів.
 *
 * Три питання на тих самих даних:
 *   1. роутинг: до якого модуля запит (47 кейсів із доменних файлів);
 *   2. `no_tool`: чи можна обійтись без даних (усі кейси);
 *   3. інʼєкції: чи містить `tool_result` команду асистенту - поруч із
 *      нинішнім regex-детектором як базовою лінією.
 *
 * Нічого не гейтить і нічого не пише. Вихід - звіт у консоль. Стан, який іде
 * в Jev, - синтетичні рядки стенду, не дані користувачів.
 *
 * Usage:
 *   pnpm --filter @sergeant/server eval:tools:jev
 *   pnpm --filter @sergeant/server eval:tools:jev -- --model=typesafe/jev-1.13
 */

import { parseArgs } from "node:util";
import process from "node:process";

import { env } from "../env/env.js";
import { percentile } from "../modules/chat/toolEval/latency.js";
import {
  formatBinary,
  INJECTION_QUESTIONS,
  injectionItems,
  JEV_ENDPOINTS,
  JEV_MODEL,
  parseAnswer,
  regexDetects,
  ROUTING_QUESTIONS,
  routingItems,
  scoreBinary,
  type JevAnswer,
  type JevQuestion,
} from "../modules/chat/toolEval/jev.js";

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 4;

interface CallResult {
  answers: Record<string, JevAnswer>;
  ms: number;
  cost: number;
  raw?: unknown;
  error?: string;
}

let endpoint: string | undefined;

async function post(url: string, body: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function callJev(
  model: string,
  state: string,
  questions: Record<string, JevQuestion>,
): Promise<CallResult> {
  const body = JSON.stringify({ model, state, questions });
  const started = performance.now();
  try {
    let res: Response | undefined;
    for (const url of endpoint ? [endpoint] : JEV_ENDPOINTS) {
      res = await post(url, body);
      if (res.status !== 404) {
        endpoint = url;
        break;
      }
    }
    const ms = performance.now() - started;
    if (!res) return { answers: {}, ms, cost: 0, error: "немає ендпоінта" };
    const json = (await res.json().catch(() => null)) as {
      answers?: Record<string, unknown>;
      usage?: { cost?: number };
      error?: { message?: string };
    } | null;
    if (!res.ok || !json?.answers) {
      return {
        answers: {},
        ms,
        cost: 0,
        error: `HTTP ${res.status}: ${json?.error?.message ?? JSON.stringify(json).slice(0, 200)}`,
      };
    }
    const answers: Record<string, JevAnswer> = {};
    for (const key of Object.keys(questions)) {
      answers[key] = parseAnswer(json.answers[key]);
    }
    return { answers, ms, cost: json.usage?.cost ?? 0, raw: json.answers };
  } catch (err) {
    return {
      answers: {},
      ms: performance.now() - started,
      cost: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function mapLimited<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { model: { type: "string" } } });
  const model = values.model ?? JEV_MODEL;

  if (!env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY не заданий.");
    process.exitCode = 1;
    return;
  }

  const routing = routingItems();
  const injections = injectionItems();

  // Перший виклик окремо: визначає ендпоінт і показує сиру форму відповіді,
  // бо саме від неї залежить `parseAnswer`.
  const probe = await callJev(
    model,
    routing[0]?.state ?? "",
    ROUTING_QUESTIONS,
  );
  if (probe.error) {
    console.error(`Пробний виклик упав: ${probe.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Модель ${model}, ендпоінт ${endpoint}`);
  console.log(`Сира відповідь на пробу: ${JSON.stringify(probe.raw)}\n`);

  const routed = await mapLimited(routing, (i) =>
    callJev(model, i.state, ROUTING_QUESTIONS),
  );
  const injected = await mapLimited(injections, (i) =>
    callJev(model, i.state, INJECTION_QUESTIONS),
  );
  const all = [...routed, ...injected];

  const errors = all.filter((r) => r.error);
  if (errors.length) {
    console.log(
      `Транспортних помилок: ${errors.length}/${all.length}. Перша: ${errors[0]?.error}\n`,
    );
  }

  // 1. Роутинг за модулем.
  let hit = 0;
  let total = 0;
  const misses: string[] = [];
  routing.forEach((item, i) => {
    if (!item.module) return;
    const got = routed[i]?.answers["module"];
    if (!got?.choice) return;
    total += 1;
    if (got.choice === item.module) hit += 1;
    else
      misses.push(
        `${item.name}: очікував ${item.module}, Jev ${got.choice} (${got.p?.toFixed(2) ?? "?"})`,
      );
  });
  console.log(
    `Роутинг за модулем: ${hit}/${total} (${total ? Math.round((hit / total) * 100) : 0}%)`,
  );
  for (const m of misses) console.log(`  · ${m}`);

  // 2. no_tool. Позитив тут - «тул НЕ потрібен», бо саме це рішення
  // дозволило б пропустити дорогу модель із тулами.
  const noTool = scoreBinary(
    routing.map((item, i) => {
      const p = routed[i]?.answers["no_tool"]?.p;
      return {
        truth: !item.needsTool,
        predicted: p === undefined ? null : p >= 0.5,
      };
    }),
  );
  console.log(`\n${formatBinary("«Тул не потрібен»", noTool)}`);
  routing.forEach((item, i) => {
    const p = routed[i]?.answers["no_tool"]?.p;
    if (p !== undefined && p >= 0.5 !== !item.needsTool) {
      console.log(
        `  · ${item.name}: no_tool=${p.toFixed(2)}, очікував ${item.needsTool ? "ні" : "так"}`,
      );
    }
  });

  // 3. Інʼєкції: Jev проти regex на тих самих рядках.
  const jevInj = scoreBinary(
    injections.map((item, i) => {
      const p = injected[i]?.answers["injection"]?.p;
      return {
        truth: item.injection,
        predicted: p === undefined ? null : p >= 0.5,
      };
    }),
  );
  const regexInj = scoreBinary(
    injections.map((item) => ({
      truth: item.injection,
      predicted: regexDetects(item.state),
    })),
  );
  console.log(
    `\nІнʼєкції (${injections.filter((i) => i.injection).length} отруєних, ${injections.filter((i) => !i.injection).length} чистих):`,
  );
  console.log(`  ${formatBinary("Jev  ", jevInj)}`);
  console.log(`  ${formatBinary("regex", regexInj)}`);
  injections.forEach((item, i) => {
    const p = injected[i]?.answers["injection"]?.p;
    if (p !== undefined && p >= 0.5 !== item.injection) {
      console.log(
        `  · ${item.name}: p=${p.toFixed(2)}, очікував ${item.injection ? "інʼєкція" : "чисто"}`,
      );
    }
  });

  // Латентність і вартість.
  const ms = all
    .filter((r) => !r.error)
    .map((r) => r.ms)
    .sort((a, b) => a - b);
  const cost = all.reduce((sum, r) => sum + r.cost, 0);
  console.log(
    `\nЛатентність (${ms.length} викликів, з мережею): p50 ${Math.round(percentile(ms, 50))} мс, p95 ${Math.round(percentile(ms, 95))} мс, max ${Math.round(ms.at(-1) ?? 0)} мс`,
  );
  console.log(`Вартість прогону: $${cost.toFixed(5)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
