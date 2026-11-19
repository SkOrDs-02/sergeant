/**
 * Зорові пайплайни стенду — `analyze-photo`, `refine-photo`, а з 2026-11-19
 * ще скан чека й імпорт скриншота виписки (`vision.finyk.ts`).
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
 *
 * Транспорт — продовий (`visionProdTransport.ts`): `/messages` через
 * `anthropicMessages`, як у `analyze-photo.ts` і клієнтах фінʼїка.
 */

import { env } from "../../src/env/env.js";
import { extractJsonFromText } from "../../src/http/jsonSafe.js";
import {
  normalizePhotoResult,
  type NormalizedPhotoResult,
} from "../../src/lib/nutritionResponse.js";
import { buildAnalyzePhotoPrompt } from "../../src/modules/nutrition/analyze-photo.js";
import { buildRefinePhotoPrompt } from "../../src/modules/nutrition/refine-photo.js";
import { visionViaOpenRouter } from "../../src/modules/nutrition/visionTransport.js";
import {
  RECEIPT_ANTHROPIC_FALLBACK_MODEL,
  receiptVisionViaOpenRouter,
} from "../../src/modules/finyk/receipts/visionTransport.js";
import { prodRoutedCandidates } from "./candidates.js";
import { catalogEntry, estimateCost } from "./cost.js";
import type { Candidate, RunResult } from "./types.js";
import type { VisionCase, VisionPipeline } from "./visionCase.js";
import {
  RECEIPT_CASES,
  STATEMENT_CASES,
  STATEMENT_TODAY,
} from "./vision.finyk.js";
import {
  callProdVision,
  photoShape,
  receiptShape,
  statementShape,
  type ProdVisionCall,
} from "./visionProdTransport.js";
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
 * «Кілька страв у кадрі» — чесне очікування для намальованого кадру.
 *
 * AI-CONTEXT: кадр — три кольорові кружки (`vision-images.ts`), а не фото.
 * До 2026-11-19 суддя вимагав три позиції в `items`, тобто нагороджував
 * модель за те, що вона назвала кружки стравами, і карав чесне «це малюнок,
 * не їжа» (замір § 6.4 дослідження `2026-11-19-openrouter-new-models.md`:
 * flash-lite «проходив», назвавши кадр «Три кульки» з порожніми КБЖВ, усі
 * кандидати «провалювали», відповідаючи чесно). Сегментацію справжніх страв
 * намальованим кадром не виміряти, тож кейс тепер міряє стриманість: провал —
 * лише впевнена страва з калоріями.
 */
function drawingJudge(text: string): true | string {
  const r = photoResult(text);
  if (!r) return "не розібрався прод-парсером";
  if (!r.isFood || hedged(r) || r.macros.kcal == null) return true;
  const names = r.items.map((i) => i.name).join(", ");
  return `впевнено назвав малюнок їжею: «${r.dishName}»${names ? ` (${names})` : ""}, ${r.macros.kcal} ккал`;
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

/** Вигадка на кадрі без їжі: прод показав би страву з калоріями. */
const inventedFood = (text: string) => {
  const r = photoResult(text);
  return r !== null && r.isFood && r.macros.kcal != null && r.macros.kcal > 0;
};

const analyzePrompt = buildAnalyzePhotoPrompt({ locale: "uk-UA" });

const ANALYZE_CASES: VisionCase[] = [
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
    abstain: true,
    fabricated: (text) => {
      const r = photoResult(text);
      return r !== null && !hedged(r) && r.isFood;
    },
    // AI-CONTEXT: до 2026-11-19 суддя вимагав лише `hedged`, тобто валив
    // чесну відмову («розмите фото, їжі не видно», `isFood: false` з високою
    // впевненістю саме в цьому) і пропускав вигадану страву з питанням. Провал
    // тепер — лише впевнена страва без питань, як і каже пастка.
    judge: (text) => {
      const r = photoResult(text);
      if (!r) return "не розібрався прод-парсером";
      return (
        !r.isFood ||
        hedged(r) ||
        `впевнений на розмитому: confidence=${r.confidence}, питань ${r.questions.length}`
      );
    },
  },
  {
    name: "намальовані кружки замість страв",
    trap: "НЕПРАВИЛЬНО: назвати три намальовані кружки стравами і впевнено порахувати калорії. Кадр синтетичний, це не їжа, тож чесна відповідь — відмова, питання чи низька впевненість. Сегментацію справжніх страв цим кадром не виміряти (див. `drawingJudge`).",
    user: analyzePrompt.user,
    image: image(MULTI_DISH_PNG_B64),
    abstain: true,
    fabricated: inventedFood,
    judge: drawingJudge,
  },
  {
    name: "порожній кадр",
    trap: "НЕПРАВИЛЬНО: вигадати страву і КБЖВ там, де їжі немає взагалі. Це найдорожчий режим відмови: цифри потрапляють у денний щоденник як справжні. Уточнююче питання тут теж провал — питати про порцію порожнечі нема сенсу, потрібна відмова.",
    user: analyzePrompt.user,
    image: image(EMPTY_PNG_B64),
    abstain: true,
    fabricated: inventedFood,
    judge: refusalJudge,
  },
  {
    name: "не-їжа в кадрі",
    trap: "НЕПРАВИЛЬНО: назвати предмет стравою або почати зʼясовувати його порцію. Саме цей режим відмови зловили на фото кота: «Кіт», впевненість 100%, нулі в КБЖВ і питання «Чи є на фото щось інше, окрім кота?» — з кнопкою «Зберегти в журнал» під ними.",
    user: analyzePrompt.user,
    image: image(NON_FOOD_PNG_B64),
    abstain: true,
    fabricated: inventedFood,
    judge: refusalJudge,
  },
];

/** Попередній результат для refine — свідомо занижений під 150 г. */
export const PRIOR_RESULT = {
  dishName: "Овочева тарілка",
  confidence: 0.5,
  portion: { label: "150 г", gramsApprox: 150 },
  ingredients: [{ name: "броколі", notes: null }],
  macros: { kcal: 180, protein_g: 8, fat_g: 6, carbs_g: 22 },
  questions: ["Яка вага порції?"],
};

/**
 * Тіло refine-запиту кейса — тест паритету шле його в прод-хендлер.
 *
 * AI-CONTEXT: до 2026-11-19 тут стояло `{ q, a }`, а прод-схема
 * (`RefinePhotoSchema`) приймає `{ question, answer }` і зайві ключі зрізає:
 * стенд показував моделі Q&A, якого прод не шле ніколи (у проді доїхало б
 * `[{}]`). Знайшов тест паритету транспорту.
 */
export const REFINE_INPUT = {
  prior_result: PRIOR_RESULT,
  portion_grams: 450,
  qna: [{ question: "Чи була олія?", answer: "Так, столова ложка" }],
  locale: "uk-UA",
};

const refinePrompt = buildRefinePhotoPrompt(REFINE_INPUT);

const REFINE_CASES: VisionCase[] = [
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
      //
      // AI-CONTEXT: до 2026-11-19 поріг був 350, тобто «помнож чернетку на
      // три». Промпт же прямо каже, що попередній результат — чернетка, а не
      // істина, і кандидати (замір § 6.5 дослідження
      // `2026-11-19-openrouter-new-models.md`) перераховували з нуля: 450 г
      // овочів плюс ложка олії = 300–340 ккал, що фізично правдоподібно, а
      // суддя це валив. Пастка ж — «повторити 180». Нижня межа 250: 450 г
      // найлегших овочів (~130 ккал) плюс столова ложка олії (~120 ккал).
      if (r.macros.kcal == null) return "ккал відсутні";
      return (
        r.macros.kcal >= 250 || `${r.macros.kcal} ккал — не перерахував із 180`
      );
    },
  },
];

// ── Кандидати ───────────────────────────────────────────────────────

/** Копіюється в кожен пайплайн — див. AI-DANGER у `pipelines.nutrition.ts`. */
const VISION_CANDIDATES: Candidate[] = [
  ...prodRoutedCandidates(
    visionViaOpenRouter() ? "openrouter" : "anthropic",
    env.OPENROUTER_VISION_MODEL,
    env.NUTRITION_MODEL,
  ),
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

/** Чек і виписка ходять на одній env-парі (`OPENROUTER_RECEIPT_MODEL`). */
const RECEIPT_CANDIDATES: Candidate[] = prodRoutedCandidates(
  receiptVisionViaOpenRouter() ? "openrouter" : "anthropic",
  env.OPENROUTER_RECEIPT_MODEL,
  RECEIPT_ANTHROPIC_FALLBACK_MODEL,
);

const analyzeShape = photoShape("analyze-photo", analyzePrompt);
const refineShape = photoShape("refine-photo", refinePrompt);
const receipt = receiptShape();
const statement = statementShape(STATEMENT_TODAY);

export const VISION_PIPELINES: VisionPipeline[] = [
  {
    key: "analyze-photo",
    label: "Nutrition analyze-photo (зір)",
    path: "food",
    shape: analyzeShape,
    system: analyzeShape.system,
    promptOrigin: "modules/nutrition/analyze-photo.ts::buildAnalyzePhotoPrompt",
    // Дзеркалить прод (`analyze-photo.ts`): нижча стеля рвала б JSON посеред
    // масиву позицій, і стенд міряв би власний ліміт замість якості моделі.
    maxTokens: analyzeShape.maxTokens,
    judge: (text) => photoResult(text) !== null,
    cases: ANALYZE_CASES,
    candidates: [...VISION_CANDIDATES],
  },
  {
    key: "refine-photo",
    label: "Nutrition refine-photo (зір)",
    path: "food",
    shape: refineShape,
    system: refineShape.system,
    promptOrigin: "modules/nutrition/refine-photo.ts::buildRefinePhotoPrompt",
    maxTokens: refineShape.maxTokens,
    judge: (text) => photoResult(text) !== null,
    cases: REFINE_CASES,
    candidates: [...VISION_CANDIDATES],
  },
  {
    key: "receipt-scan",
    label: "Finyk скан чека (зір)",
    path: "receipt",
    shape: receipt,
    system: receipt.system,
    promptOrigin:
      "modules/finyk/receipts/prompts.ts::RECEIPT_VISION_SYSTEM_PROMPT",
    maxTokens: receipt.maxTokens,
    judge: (text) => extractJsonFromText(text) !== null,
    cases: RECEIPT_CASES.map((c) => ({ ...c, user: receipt.user })),
    candidates: [...RECEIPT_CANDIDATES],
  },
  {
    key: "statement-import",
    label: "Finyk імпорт скриншота виписки (зір)",
    path: "statement",
    shape: statement,
    system: statement.system,
    promptOrigin:
      "modules/finyk/import/prompts.ts::IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT",
    maxTokens: statement.maxTokens,
    judge: (text) => extractJsonFromText(text) !== null,
    cases: STATEMENT_CASES.map((c) => ({ ...c, user: statement.user })),
    candidates: [...RECEIPT_CANDIDATES],
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

const DRY_RUN_CALL: ProdVisionCall = {
  ok: true,
  text: "stub",
  inputTokens: 0,
  outputTokens: 0,
  servedBy: null,
  gatewayCostUsd: null,
  stopReason: null,
  attemptStatuses: [],
  finalStatus: null,
};

/** Вердикт судді з тексту відповіді: спільний для прогону і перерахунку. */
function judgeVisionText(
  pipeline: VisionPipeline,
  goldenCase: VisionCase,
  text: string,
): Pick<
  RunResult,
  "passedJudge" | "judgeReason" | "brokenJson" | "fabricated"
> {
  const verdict = (goldenCase.judge ?? pipeline.judge)(text);
  return {
    passedJudge: verdict === true,
    judgeReason: typeof verdict === "string" ? verdict : null,
    brokenJson: typeof verdict === "string" && /прод-парсер/.test(verdict),
    fabricated:
      verdict !== true && goldenCase.fabricated
        ? goldenCase.fabricated(text)
        : false,
  };
}

/**
 * Перерахунок збереженого рядка (`--json-out`) поточними суддями, без
 * мережі: правка судді не вимагає платного повтору. `null` — кейс або
 * пайплайн зник зі стенду.
 */
export function rejudgeVisionResult(r: RunResult): RunResult | null {
  const pipeline = VISION_PIPELINES.find((p) => p.key === r.pipeline);
  const goldenCase = pipeline?.cases.find((c) => c.name === r.caseName);
  if (!pipeline || !goldenCase) return null;
  const base = {
    ...r,
    path: pipeline.path,
    abstain: goldenCase.abstain === true,
  };
  if (r.transportFailed) return base;
  return { ...base, ...judgeVisionText(pipeline, goldenCase, r.text) };
}

export async function runVisionOne(
  pipeline: VisionPipeline,
  goldenCase: VisionCase,
  candidate: Candidate,
  dryRun: boolean,
): Promise<RunResult> {
  const t0 = Date.now();
  const img = goldenCase.image;
  const raw: ProdVisionCall = dryRun
    ? DRY_RUN_CALL
    : !img
      ? { ...DRY_RUN_CALL, ok: false, text: "", error: "кейс без зображення" }
      : await callProdVision(
          candidate,
          { ...pipeline.shape, user: goldenCase.user },
          img,
          `internal/vision-eval/${pipeline.key}`,
        );

  const base = {
    ...(dryRun ? { executionMode: "dry-run" as const } : {}),
    pipeline: pipeline.key,
    path: pipeline.path,
    caseName: goldenCase.name,
    trap: goldenCase.trap,
    candidate,
    latencyMs: Date.now() - t0,
    servedBy: raw.servedBy,
    gatewayCostUsd: raw.gatewayCostUsd,
    cacheReadTokens: null,
    // Зорові шляхи не user-facing текстом — голос міряти нема на чому.
    voiceFails: null,
    attemptStatuses: raw.attemptStatuses,
    finalStatus: raw.finalStatus,
    stopReason: raw.stopReason,
    abstain: goldenCase.abstain === true,
  };

  if (!raw.ok) {
    return {
      ...base,
      ok: false,
      // Транспортна помилка (B47, напр. HTTP 401 без ключа чи 429 після
      // ретраїв) — модель не відповіла, це не вердикт судді. `report.ts`
      // виключає такі рядки зі знаменника точності.
      transportFailed: true,
      passedJudge: false,
      judgeReason: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      text: "",
      error: raw.error ?? "error",
      brokenJson: false,
      fabricated: false,
    };
  }
  const judged = judgeVisionText(pipeline, goldenCase, raw.text);
  return {
    ...base,
    ok: true,
    transportFailed: false,
    ...judged,
    // Stub-відповідь не JSON: у сухому прогоні це не «бите JSON» моделі.
    ...(dryRun ? { brokenJson: false, fabricated: false } : {}),
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
    costUsd: estimateCost(candidate.model, raw.inputTokens, raw.outputTokens),
    text: raw.text,
  };
}
