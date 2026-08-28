/**
 * Спільні типи стенду порівняння моделей (`pnpm eval:models`).
 *
 * AI-CONTEXT: винесено з `model-eval.ts` разом із пайплайнами — файл перетинав
 * стелю Hard Rule #18 (600 рядків), щойно кожен пайплайн отримав реальний
 * промпт і голден-сет із пастками.
 */

import type { LLMProviderName } from "../../src/lib/llm/provider.js";

/**
 * Вердикт судді: `true` — пройшов, `false` — провалив, рядок — провалив, і
 * рядок називає ЯКИЙ предикат не зійшовся.
 *
 * AI-CONTEXT: судді складені («≥2 рецепти І без арахісу»), а колонка була
 * булева. Через це кейс «алерген у виключеннях» показував ❌ там, де арахісу
 * в відповіді не було взагалі — модель просто віддала один рецепт. Читалось
 * як брехня судді, хоча суддя був правий про інше. Рядок робить провал
 * самопояснювальним, і це дешевше за окремий кейс на кожен предикат.
 */
export type JudgeVerdict = boolean | string;

export interface Candidate {
  provider: Extract<LLMProviderName, "anthropic" | "openrouter">;
  model: string;
  label: string;
}

/**
 * Один кейс голден-сету. Системний промпт фіксований на пайплайн (прод шле
 * рівно один), тож кейс варіює лише user-репліку — саме там і різниться
 * реальний трафік.
 *
 * `judge` звужує дефолт пайплайну, коли в кейса є гостріший режим відмови.
 * `trap` — обовʼязкове однорядкове формулювання «що для цього кейса означає
 * НЕПРАВИЛЬНО». Воно пишеться ПЕРЕД суддею: у попередній ітерації судді
 * писалися під наявні відповіді й шість разів помилилися в обидва боки.
 */
export interface GoldenCase {
  name: string;
  user: string;
  /** Що саме тут означає «модель відповіла неправильно». */
  trap: string;
  judge?: (text: string) => JudgeVerdict;
  /** Перекриває `system` пайплайну (динамічні промпти на кшталт digest). */
  system?: string;
  /**
   * Зображення кейса — лише для зорового стенду (`pnpm eval:vision`).
   * `base64` БЕЗ data-URL-префікса, як і в тілі продового запиту.
   * Текстовий стенд це поле не читає.
   */
  image?: { base64: string; mimeType: string };
}

export interface Pipeline {
  key: string;
  label: string;
  /**
   * Системний промпт — ЗАВЖДИ з продового білдера, ніколи не рукописний.
   * `undefined` означає, що прод сам не шле `system` (coach-insight, day-hint
   * пакують усе в user-репліку) — стенд це дзеркалить, інакше міряє інший
   * режим моделі.
   */
  system: string | undefined;
  /** Звідки взято промпт — друкується у звіті, перевіряється тестом. */
  promptOrigin: string;
  maxTokens: number;
  candidates: Candidate[];
  /** Дешева перевірка на грубий промах — НЕ оцінка якості. */
  judge: (text: string) => JudgeVerdict;
  cases: GoldenCase[];
  /** Прогнати VOICE_RULES поверх `judge` (лише user-facing пайплайни). */
  checkVoice?: boolean;
  /**
   * Чи ставить прод `cache_control` на цьому шляху. Лише `chat`/`analysis`:
   * решта — одноразові фонові задачі, для них колонка «з кешем» порожня, бо
   * кешу немає за побудовою (спека § Вартість).
   */
  cacheable?: boolean;
}

export interface RunResult {
  pipeline: string;
  caseName: string;
  trap: string;
  candidate: Candidate;
  ok: boolean;
  /**
   * Транспортна помилка (мережа, HTTP 401/429/timeout, відсутній ключ) — не
   * судження про якість моделі: модель узагалі не відповіла.
   *
   * AI-CONTEXT (B47): до цього поля `passedJudge: false` для транспортного
   * провалу й `passedJudge: false` для «модель відповіла неправильно»
   * виглядали в звіті ОДНАКОВО — знаменник точності у `report.ts` рахував
   * ВСІ рядки, тож 6 HTTP-401 рендерились як «модель провалила всі
   * пастки». Звіт зобовʼязаний рахувати й показувати ці два факти окремо —
   * див. `report.ts::summarySection`.
   */
  transportFailed: boolean;
  passedJudge: boolean;
  /** Який предикат склáденого судді не зійшовся; `null` — судді нічого сказати. */
  judgeReason: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Реально прочитано з кешу провайдера; `null` — провайдер не репортить. */
  cacheReadTokens: number | null;
  costUsd: number | null;
  /** Повний, необрізаний текст — звіт зобовʼязаний уміти його показати. */
  text: string;
  /** `null` — пайплайн не user-facing, голос не міряємо. */
  voiceFails: string[] | null;
  error?: string;
}
