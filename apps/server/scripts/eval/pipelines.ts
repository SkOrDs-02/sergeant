/**
 * Реєстр пайплайнів стенду. Один список — щоб `--pipeline=` і тест паритету
 * промптів бачили те саме, і жоден шлях не міг тихо випасти з прогону.
 *
 * Покриття проти інвентарю `grep -rhoE 'endpoint: "[^"]+"' apps/server/src`:
 * текстові LLM-шляхи покриті всі, крім `chat-stream`/`chat-tool-result`
 * (той самий промпт, що `chat`, інший транспорт — `pnpm eval:stream`) і
 * `embed` (Voyage, не LLM-роутинг). Зорові `analyze-photo`/`refine-photo`
 * живуть в окремому стенді `pnpm eval:vision`: інший вхід, інші кандидати.
 */

import { FINANCE_PIPELINES } from "./pipelines.finance.js";
import { NUTRITION_PIPELINES } from "./pipelines.nutrition.js";
import type { Pipeline } from "./types.js";

export const PIPELINES: Pipeline[] = [
  ...FINANCE_PIPELINES,
  ...NUTRITION_PIPELINES,
];
