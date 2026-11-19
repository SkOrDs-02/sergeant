/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Як розкласти уточнюючі питання моделі під аналізом фото.
 *
 * **Порцію питаємо один раз.** У картці є постійне числове поле порції, а
 * модель, побачивши невідому вагу, питала те саме своїми словами («Яка
 * приблизна вага страви на тарілці?») — два поля під одне число (фідбек
 * власника 2026-11-19). Рішення власника: модель ПИТАЄ про порцію, але поле
 * одне. Тому її питання про вагу всієї страви не стає окремим текстовим
 * полем, а підписує саме числове поле порції; відповідь іде і як
 * `portion_grams`, і як відповідь на це питання в `qna` (див.
 * `usePhotoAnalysis.refinePhoto`), тож модель бачить, що її питання закрите.
 *
 * Питання про вагу ОКРЕМОЇ позиції на тарілці з кількома стравами («Скільки
 * грамів рису?») — не дубль: поле порції — це вага всієї тарілки. Таке
 * питання лишається звичайним текстовим уточненням.
 */

/** Стільки решти питань картка показує й відправляє в перерахунок. */
export const MAX_PHOTO_QUESTIONS = 6;

// `\b` у JS бачить межу слова лише для ASCII, тож межу перед кириличним
// словом задає явна «не-літера або початок рядка».
const WEIGHT_QUESTION_RE =
  /(^|[^\p{L}])(ваг[аиуіо]|вазі|важит|важил|важив|грам|weigh|gram)/iu;

// «Яка порція?» / «Який розмір порції?» — та сама вага іншими словами. Але
// «скільки соусу» чи «яка олія» сюди не потрапляють: там немає слова «порці».
const PORTION_SIZE_RE =
  /(^|[^\p{L}])(як[аийо]\p{L}*|розмір\p{L}*)\s+(\p{L}+\s+){0,2}порці/iu;

// Питання саме про всю тарілку, а не про одну з позицій на ній.
const WHOLE_PLATE_RE =
  /(^|[^\p{L}])(страв|тарілк|тарілц|порці|всього|усього|загалом|разом)/iu;

/** Питання про вагу чи розмір порції. */
export function isPortionWeightQuestion(question: string): boolean {
  return WEIGHT_QUESTION_RE.test(question) || PORTION_SIZE_RE.test(question);
}

export interface PhotoQuestionsSplit {
  /**
   * Питання моделі про вагу всієї страви — підпис числового поля порції.
   * `null`, коли модель про порцію не питала: тоді поле має власний підпис.
   */
  portionQuestion: string | null;
  /** Решта питань — окремі текстові поля, у порядку моделі. */
  otherQuestions: string[];
}

/**
 * Розкладає питання моделі на «питання про порцію» (максимум одне) і решту.
 * Один помічник і для картки, і для перерахунку: обидва місця мусять бачити
 * той самий розклад, інакше відповідь потрапила б не до свого питання.
 *
 * @param itemsCount скільки позицій на тарілці. На одній позиції будь-яке
 *   питання про вагу — це вага страви; на кількох — лише те, що прямо
 *   говорить про страву, тарілку чи порцію.
 */
export function splitPhotoQuestions(
  questions: readonly unknown[] | null | undefined,
  itemsCount: number,
): PhotoQuestionsSplit {
  const all = Array.isArray(questions)
    ? questions.filter(
        (q): q is string => typeof q === "string" && q.trim() !== "",
      )
    : [];
  let portionQuestion: string | null = null;
  const otherQuestions: string[] = [];
  for (const q of all) {
    const aboutWholePlate =
      isPortionWeightQuestion(q) && (itemsCount <= 1 || WHOLE_PLATE_RE.test(q));
    if (aboutWholePlate) {
      // Друге питання про вагу всієї страви — той самий дубль, що й був:
      // поле одне, тож і питання одне.
      if (portionQuestion === null) portionQuestion = q;
      continue;
    }
    otherQuestions.push(q);
  }
  return {
    portionQuestion,
    otherQuestions: otherQuestions.slice(0, MAX_PHOTO_QUESTIONS),
  };
}
