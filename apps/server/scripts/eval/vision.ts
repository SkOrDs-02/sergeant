/**
 * Зорові пайплайни стенду — `analyze-photo` і `refine-photo`.
 *
 * Чому окремо від текстового стенду (спека `ai-eval-harness-v2.md` § Зорові
 * шляхи): інший вхід (зображення, не репліка), інші кандидати (не кожна
 * модель приймає картинки) і інші пастки (розмите фото, кілька страв у кадрі,
 * етикетка іноземною, порожній кадр).
 *
 * Промпти — з продових білдерів `buildAnalyzePhotoPrompt` /
 * `buildRefinePhotoPrompt`, не копії. Судді СТРУКТУРНІ: відповідь іде через
 * `extractJsonFromText` + `normalizePhotoResult`, тобто рівно той шлях, яким
 * прод перетворює текст моделі на екран користувача.
 */

import { sumMacrosNullable } from "@sergeant/shared";

import { env } from "../../src/env/env.js";
import { extractJsonFromText } from "../../src/http/jsonSafe.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../src/lib/anthropic.js";
import {
  normalizePhotoResult,
  PHOTO_ITEMS_LIMIT,
  type NormalizedPhotoResult,
} from "../../src/lib/nutritionResponse.js";
import { buildAnalyzePhotoPrompt } from "../../src/modules/nutrition/analyze-photo.js";
import { buildRefinePhotoPrompt } from "../../src/modules/nutrition/refine-photo.js";
import { catalogEntry, estimateCost } from "./cost.js";
import type { Candidate, GoldenCase, Pipeline, RunResult } from "./types.js";
import {
  BLURRED_PNG_B64,
  EMPTY_PNG_B64,
  LABEL_PNG_B64,
  MULTI_DISH_PNG_B64,
  NON_FOOD_PNG_B64,
  PNG_MIME,
} from "./vision-images.js";

// ── Судді ───────────────────────────────────────────────────────────

/** Той самий ланцюжок, що в продовому хендлері: текст → JSON → нормалізатор. */
function photoResult(text: string): NormalizedPhotoResult | null {
  const parsed = extractJsonFromText(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return normalizePhotoResult(parsed);
}

/**
 * Посегментна якість розбивки (ініціатива 0023, крок 6 PR-1).
 *
 * На кадрі три різні страви, тож єдиний рядок — це провал, який людина
 * побачить як занижений денний підсумок і не зможе виправити точково.
 * Перевіряємо три речі одночасно: скільки позицій приїхало, чи тримається
 * стеля 5, і чи підсумок дорівнює сумі позицій — розбіжність тут означає,
 * що екран показує число, якого в рядках немає.
 */
function segmentationJudge(text: string): true | string {
  const r = photoResult(text);
  if (!r) return "не розібрався прод-парсером";
  if (r.items.length < 2) {
    return `позицій ${r.items.length} на кадрі з трьох страв (${r.dishName})`;
  }
  if (r.items.length > PHOTO_ITEMS_LIMIT) {
    return `позицій ${r.items.length} — стеля ${PHOTO_ITEMS_LIMIT} не втрималась`;
  }
  const summed = sumMacrosNullable(r.items.map((i) => i.macros));
  if (summed.kcal !== r.macros.kcal) {
    return `підсумок ${r.macros.kcal ?? "—"} ≠ сума позицій ${summed.kcal ?? "—"}`;
  }
  return true;
}

/** Модель зізналася, що даних бракує: питання або низька впевненість. */
function hedged(r: NormalizedPhotoResult): boolean {
  return r.questions.length > 0 || r.confidence <= 0.5;
}

/**
 * Кадр без їжі: єдина прийнятна відповідь — відмова (`isFood: false`).
 *
 * AI-CONTEXT: до 2026-08-07 цей суддя приймав «0 ккал + уточнююче питання» як
 * успіх (через `hedged`), тобто продовий баг із фото кота проходив стенд
 * зеленим. Хеджування — не відмова: воно веде людину в блок «Уточнення порції»
 * і лишає кнопку збереження. Тому тут перевіряємо саме прапорець, який
 * `normalizePhotoResult` виводить і з явного поля, і з відсутніх КБЖВ.
 */
function refusalJudge(text: string): true | string {
  const r = photoResult(text);
  if (!r) return "не розібрався прод-парсером";
  if (r.isFood) {
    return `назвав «${r.dishName}» їжею (confidence=${r.confidence}, ккал ${r.macros.kcal ?? "—"})`;
  }
  return true;
}

// ── Голден-сет ──────────────────────────────────────────────────────

const image = (base64: string) => ({ base64, mimeType: PNG_MIME });

const analyzePrompt = buildAnalyzePhotoPrompt({ locale: "uk-UA" });

const ANALYZE_CASES: GoldenCase[] = [
  {
    name: "етикетка іноземною",
    trap: "НЕПРАВИЛЬНО: не прочитати намальований текст і вигадати страву замість молока, або загубити обʼєм 950 мл. Обʼєктивна перевірка тут одна — чи доїхали числа з етикетки у відповідь.",
    user: analyzePrompt.user,
    image: image(LABEL_PNG_B64),
    judge: (text) => {
      const r = photoResult(text);
      if (!r) return "не розібрався прод-парсером";
      const missing = [
        /950/.test(text) ? null : "обʼєм 950",
        /молок|milch|milk/i.test(text) ? null : "молоко",
      ].filter((v): v is string => v !== null);
      return missing.length === 0 || `не прочитано: ${missing.join(", ")}`;
    },
  },
  {
    name: "розмите фото",
    trap: "НЕПРАВИЛЬНО: впевнено назвати страву й видати точні КБЖВ по кадру, де нічого не розібрати. Правильно — питання або низька confidence. Прод показує ці цифри як факт, тож вигадана впевненість тут дорожча за відмову.",
    user: analyzePrompt.user,
    image: image(BLURRED_PNG_B64),
    judge: (text) => {
      const r = photoResult(text);
      if (!r) return "не розібрався прод-парсером";
      return (
        hedged(r) ||
        `впевнений на розмитому: confidence=${r.confidence}, питань ${r.questions.length}`
      );
    },
  },
  {
    name: "кілька страв у кадрі",
    trap: "НЕПРАВИЛЬНО: описати одну страву з трьох і порахувати КБЖВ лише для неї — користувач отримає занижений денний підсумок. Правильно: окрема позиція в `items` на кожну страву, щоб хибну можна було виправити без арифметики.",
    user: analyzePrompt.user,
    image: image(MULTI_DISH_PNG_B64),
    judge: segmentationJudge,
  },
  {
    name: "порожній кадр",
    trap: "НЕПРАВИЛЬНО: вигадати страву і КБЖВ там, де їжі немає взагалі. Це найдорожчий режим відмови: цифри потрапляють у денний щоденник як справжні. Уточнююче питання тут теж провал — питати про порцію порожнечі нема сенсу, потрібна відмова.",
    user: analyzePrompt.user,
    image: image(EMPTY_PNG_B64),
    judge: refusalJudge,
  },
  {
    name: "не-їжа в кадрі",
    trap: "НЕПРАВИЛЬНО: назвати предмет стравою або почати зʼясовувати його порцію. Саме цей режим відмови зловили на фото кота: «Кіт», впевненість 100%, нулі в КБЖВ і питання «Чи є на фото щось інше, окрім кота?» — з кнопкою «Зберегти в журнал» під ними.",
    user: analyzePrompt.user,
    image: image(NON_FOOD_PNG_B64),
    judge: refusalJudge,
  },
];

/** Попередній результат для refine — свідомо занижений під 150 г. */
const PRIOR_RESULT = {
  dishName: "Овочева тарілка",
  confidence: 0.5,
  portion: { label: "150 г", gramsApprox: 150 },
  ingredients: [{ name: "броколі", notes: null }],
  macros: { kcal: 180, protein_g: 8, fat_g: 6, carbs_g: 22 },
  questions: ["Яка вага порції?"],
};

const refinePrompt = buildRefinePhotoPrompt({
  prior_result: PRIOR_RESULT,
  portion_grams: 450,
  qna: [{ q: "Чи була олія?", a: "Так, столова ложка" }],
  locale: "uk-UA",
});

const REFINE_CASES: GoldenCase[] = [
  {
    name: "перерахунок під 450 г",
    trap: "НЕПРАВИЛЬНО: повторити КБЖВ попереднього результату (180 ккал на 150 г) при вазі, більшій утричі. Уточнення користувача тоді не має жодного ефекту — саме та тиха поломка, заради якої існує окремий ендпоінт.",
    user: refinePrompt.user,
    image: image(MULTI_DISH_PNG_B64),
    judge: (text) => {
      const r = photoResult(text);
      if (!r) return "не розібрався прод-парсером";
      // Порція втричі більша — ккал мають помітно зрости. Точний множник не
      // вимагаємо: додана олія теж легально змінює число.
      if (r.macros.kcal == null) return "ккал відсутні";
      return (
        r.macros.kcal >= 350 || `${r.macros.kcal} ккал — не перерахував із 180`
      );
    },
  },
];

// ── Кандидати ───────────────────────────────────────────────────────

/** Копіюється в кожен пайплайн — див. AI-DANGER у `pipelines.nutrition.ts`. */
const VISION_CANDIDATES: Candidate[] = [
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
  {
    provider: "openrouter",
    model: "anthropic/claude-haiku-4.5",
    label: "OpenRouter Claude Haiku 4.5",
  },
  {
    provider: "openrouter",
    model: "z-ai/glm-4.7-flash",
    label: "OpenRouter GLM 4.7 Flash",
  },
];

export const VISION_PIPELINES: Pipeline[] = [
  {
    key: "analyze-photo",
    label: "Nutrition analyze-photo (зір)",
    system: analyzePrompt.system,
    promptOrigin: "modules/nutrition/analyze-photo.ts::buildAnalyzePhotoPrompt",
    // Дзеркалить прод (`analyze-photo.ts`): нижча стеля рвала б JSON посеред
    // масиву позицій, і стенд міряв би власний ліміт замість якості моделі.
    maxTokens: 1000,
    judge: (text) => photoResult(text) !== null,
    cases: ANALYZE_CASES,
    candidates: [...VISION_CANDIDATES],
  },
  {
    key: "refine-photo",
    label: "Nutrition refine-photo (зір)",
    system: refinePrompt.system,
    promptOrigin: "modules/nutrition/refine-photo.ts::buildRefinePhotoPrompt",
    maxTokens: 950,
    judge: (text) => photoResult(text) !== null,
    cases: REFINE_CASES,
    candidates: [...VISION_CANDIDATES],
  },
];

// ── Фільтр модальностей ─────────────────────────────────────────────

export interface ModalityFilter {
  kept: Candidate[];
  dropped: Array<{ candidate: Candidate; reason: string }>;
}

/**
 * Відсіює кандидатів без підтримки зображень за `input_modalities` з живого
 * каталогу OpenRouter. Спека прямо називає це ризиком: без фільтра половина
 * прогону падає з помилкою провайдера, і в таблиці замість «модель не вміє
 * картинок» зʼявляється «модель провалила кейс» — різні висновки.
 *
 * Anthropic-кандидати не фільтруємо: каталог тримає їх під іншими id
 * (`anthropic/claude-…` проти прямого `claude-…`), а всі поточні Claude
 * приймають зображення. Невідома OpenRouter-модель — теж відсів: краще
 * прибрати рядок, ніж показати провал невідомого походження.
 */
export function filterByModality(
  candidates: Candidate[],
  opts: { enforce: boolean },
): ModalityFilter {
  if (!opts.enforce) return { kept: [...candidates], dropped: [] };
  const kept: Candidate[] = [];
  const dropped: ModalityFilter["dropped"] = [];
  for (const candidate of candidates) {
    if (candidate.provider !== "openrouter") {
      kept.push(candidate);
      continue;
    }
    const entry = catalogEntry(candidate.model);
    if (!entry) {
      dropped.push({ candidate, reason: "немає в каталозі OpenRouter" });
      continue;
    }
    if (!entry.inputModalities.includes("image")) {
      dropped.push({
        candidate,
        reason: `input_modalities = [${entry.inputModalities.join(", ") || "—"}]`,
      });
      continue;
    }
    kept.push(candidate);
  }
  return { kept, dropped };
}

// ── Прогін ──────────────────────────────────────────────────────────

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface RawCall {
  ok: boolean;
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  error?: string;
}

/**
 * AI-CONTEXT: чому не `invokeLLM`, яким ходить текстовий стенд. `LLMMessage.content`
 * у продовій абстракції — це `string`; блоків із зображенням у неї не влазить,
 * і продові зорові хендлери теж ідуть повз неї, прямо в `anthropicMessages()`.
 * Тож anthropic-гілка нижче викликає РІВНО ту саму функцію, що
 * `analyze-photo.ts`, а openrouter-гілка дзеркалить `OpenRouterProvider`
 * з `image_url`-блоком. Маскування PII тут навмисно немає: у стенді немає
 * даних користувача — картинки намальовані, промпт продовий.
 */
async function callVision(
  candidate: Candidate,
  system: string,
  goldenCase: GoldenCase,
  maxTokens: number,
  endpoint: string,
): Promise<RawCall> {
  const img = goldenCase.image;
  if (!img)
    return {
      ok: false,
      text: "",
      inputTokens: null,
      outputTokens: null,
      error: "кейс без зображення",
    };

  if (candidate.provider === "anthropic") {
    const { response, data } = await anthropicMessages(
      env.ANTHROPIC_API_KEY,
      {
        model: candidate.model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: img.mimeType,
                  data: img.base64,
                },
              },
              { type: "text", text: goldenCase.user },
            ],
          },
        ],
      },
      { timeoutMs: 60_000, endpoint },
    );
    if (!response || !response.ok) {
      return {
        ok: false,
        text: "",
        inputTokens: null,
        outputTokens: null,
        error: `anthropic HTTP ${response?.status ?? 0}`,
      };
    }
    const usage = (data as { usage?: Record<string, number> } | undefined)
      ?.usage;
    return {
      ok: true,
      text: extractAnthropicText(data),
      inputTokens: usage?.["input_tokens"] ?? null,
      outputTokens: usage?.["output_tokens"] ?? null,
    };
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://sergeant.app",
      "X-Title": "Sergeant",
    },
    body: JSON.stringify({
      model: candidate.model,
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${img.mimeType};base64,${img.base64}`,
              },
            },
            { type: "text", text: goldenCase.user },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (!response.ok) {
    return {
      ok: false,
      text: "",
      inputTokens: null,
      outputTokens: null,
      error: data.error?.message ?? `openrouter HTTP ${response.status}`,
    };
  }
  return {
    ok: true,
    text: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
  };
}

export async function runVisionOne(
  pipeline: Pipeline,
  goldenCase: GoldenCase,
  candidate: Candidate,
  dryRun: boolean,
): Promise<RunResult> {
  const system = goldenCase.system ?? pipeline.system ?? "";
  const t0 = Date.now();
  const raw: RawCall = dryRun
    ? { ok: true, text: "stub", inputTokens: 0, outputTokens: 0 }
    : await callVision(
        candidate,
        system,
        goldenCase,
        pipeline.maxTokens,
        `internal/vision-eval/${pipeline.key}`,
      ).catch((err: unknown) => ({
        ok: false,
        text: "",
        inputTokens: null,
        outputTokens: null,
        error: err instanceof Error ? err.message : String(err),
      }));

  const base = {
    pipeline: pipeline.key,
    caseName: goldenCase.name,
    trap: goldenCase.trap,
    candidate,
    latencyMs: Date.now() - t0,
    cacheReadTokens: null,
    // Зорові шляхи не user-facing текстом — голос міряти нема на чому.
    voiceFails: null,
  };

  if (!raw.ok) {
    return {
      ...base,
      ok: false,
      // Транспортна помилка (B47, напр. HTTP 401 без ключа) — модель не
      // відповіла, це не вердикт судді. `report.ts` виключає такі рядки зі
      // знаменника точності, інакше 401 рендериться як «модель провалила
      // всі пастки» (закоміченy звіт `vision-eval-2026-08-25.md` саме так
      // прочитався).
      transportFailed: true,
      passedJudge: false,
      judgeReason: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      text: "",
      error: raw.error ?? "error",
    };
  }
  const verdict = (goldenCase.judge ?? pipeline.judge)(raw.text);
  return {
    ...base,
    ok: true,
    transportFailed: false,
    passedJudge: verdict === true,
    judgeReason: typeof verdict === "string" ? verdict : null,
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
    costUsd: estimateCost(candidate.model, raw.inputTokens, raw.outputTokens),
    text: raw.text,
  };
}
