/**
 * Типи зорового стенду поверх спільних `types.ts`.
 *
 * Зоровий кейс несе дві речі, яких текстовий не має: чи це пастка «чесно
 * відмовитись» (`abstain`) і як відрізнити вигадку від іншого провалу. Без
 * цього в зведенні «провалив пастку» і «вигадав суму, якої немає на кадрі»
 * злипались би в одне число, а для чеків і виписок друге набагато дорожче:
 * вигадана сума їде в журнал витрат як справжня.
 */

import type { GoldenCase, Pipeline } from "./types.js";
import type { ProdVisionShape } from "./visionProdTransport.js";

export interface VisionCase extends GoldenCase {
  /** Правильна відповідь — відмова чи «не видно», а не дані. */
  abstain?: boolean;
  /** `true` — відповідь містить вигадане (лише для `abstain`-кейсів). */
  fabricated?: (text: string) => boolean;
}

/** Прод-шлях, до якого належить пайплайн: так групує зведення. */
export type VisionPath = "receipt" | "statement" | "food";

export interface VisionPipeline extends Pipeline {
  path: VisionPath;
  /** Параметри продового виклику: промпт, `max_tokens`, температура, таймаут. */
  shape: ProdVisionShape;
  cases: VisionCase[];
}
