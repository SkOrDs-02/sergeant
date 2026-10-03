/**
 * Верифікація чисел у відповідях чату (ADR-0097, спека
 * `docs/work/specs/link-evidence-standard.md`, блок «Верифікація чисел»).
 *
 * Бібліотека чиста: ніякого I/O, жодного читання env, жодних метрик. Хто її
 * викликає, вирішує сам, що робити з вердиктом.
 *
 * Підключення (тіньовий режим, `CHAT_NUMBER_VERIFY`) - у `shadow.ts`: це
 * єдиний файл теки, що знає про env, метрики й лог; `chat.ts` і
 * `chatStream.ts` роблять до нього один тонкий виклик.
 */

import { type GivenSources, buildGivenCorpus } from "./givenCorpus.js";
import { type VerifyResult, verifyNumbers } from "./match.js";

export { type NumberToken, extractNumberTokens, tokenKind } from "./extract.js";
export {
  EMPTY_GIVEN,
  type GivenCorpus,
  type GivenSources,
  buildGivenCorpus,
  corpusFromValues,
} from "./givenCorpus.js";
export {
  type Explained,
  type VerifiedToken,
  type VerifyOutcome,
  type VerifyResult,
  MAX_DERIVATION_OPERANDS,
  MAX_DERIVATION_TARGETS,
  MAX_POOL_SIZE,
  isDerivable,
  verifyNumbers,
} from "./match.js";
export {
  type NumberKind,
  type NumberUnit,
  SCOPE_MIN_VALUE,
  maskNonQuantities,
  parseNumeral,
  toleranceFor,
} from "./normalize.js";
export {
  type LabeledValue,
  EXACT_VALUES_TITLE,
  MAX_EXACT_VALUES,
  MIN_VISIBLE_LETTERS,
  NUMBER_FREE_INTRO,
  NUMBER_FREE_INTRO_NO_VALUES,
  collectLabeledValues,
  renderExactValuesBlock,
  renderNumberFreeAnswer,
  stripDigitSentences,
} from "./render.js";

/**
 * Один виклик: числа відповіді проти джерел, які модель бачила на вході.
 * Те саме, що `verifyNumbers(answer, buildGivenCorpus(sources))`.
 */
export function verifyAnswerNumbers(
  answer: string,
  sources: GivenSources,
): VerifyResult {
  return verifyNumbers(answer, buildGivenCorpus(sources));
}
