/**
 * Last validated: 2026-08-22
 * Status: Active
 *
 * Групування розрядів прямо в полі вводу: `80000` → `80 000`.
 *
 * # Навіщо
 *
 * Режим перегляду розряди вже групує — `toLocaleString("uk-UA")` у хабі,
 * інсайтах і HubChat, `Money` у картках. Поле вводу показувало те саме
 * число суцільним рядком, тож одна сума виглядала по-різному залежно від
 * того, дивляться на неї чи редагують. Спіймано бета-тестером 2026-08-22
 * на «Плані доходу»: «а можна пробіли після кожних 3 знаків».
 *
 * # Чому роздільник саме U+00A0
 *
 * Той самий, що й у `formatNumberUk` (`@sergeant/shared`), тож поле і `Money`
 * сходяться символ-у-символ. Власний `Intl` для uk-UA групує вужчим U+202F,
 * але той майже непомітний: на живому тесті «1 234 567» читалось як суцільне
 * число, тож продукт нормалізує роздільник до звичайного нерозривного пробілу.
 * Парсери (`normalizeDecimalInput`, `normalizeAmountInput`) знімають обидва
 * нарівні зі звичайним пробілом, тож у сторі значення незмінне: групування
 * живе ЛИШЕ у представленні.
 *
 * # Чому каретку доводиться рахувати вручну
 *
 * Форматувати на кожне натискання без корекції каретки не можна: вставлений
 * роздільник зсуває всі індекси праворуч, і курсор або їде в кінець рядка,
 * або перестрибує через пробіл. Тому позиція рахується не в символах, а в
 * ЗНАЧУЩИХ символах (цифри + десятковий роздільник) зліва від курсора —
 * єдина величина, якої форматування не змінює.
 */

/**
 * Роздільник, який вставляємо ми. Дзеркалить `GROUP_SEPARATOR` із
 * `@sergeant/shared` (`lib/formatNumber.ts`) — константа продубльована
 * навмисно, щоб не тягнути бочку пакета в цей модуль (той самий eager-граф,
 * що колись поклав boot через `AuthContext`). Парність гейтить тест.
 */
export const GROUP_SEPARATOR = "\u00a0";

/**
 * Усе, чим ввід або вставка з іншого застосунку може розділити групи цифр.
 * Дзеркалить `GROUP_SEPARATORS` з `numberInput.ts` і `amount.ts` — той
 * самий набір, лише тут він ще й ЗНІМАЄТЬСЯ перед перегрупуванням, а не
 * тільки перед парсингом.
 */
const GROUP_SEPARATORS = /[\s\u00a0\u202f\u2009']/g;

/** Цифри й десятковий роздільник — те, що користувач справді набрав. */
const SIGNIFICANT = /[\d.,]/;

function stripSeparators(raw: string): string {
  return raw.replace(GROUP_SEPARATORS, "");
}

function countSignificant(raw: string): number {
  let count = 0;
  for (const char of raw) if (SIGNIFICANT.test(char)) count += 1;
  return count;
}

/**
 * Індекс, куди поставити курсор, щоб зліва від нього лишилось рівно
 * `count` значущих символів.
 */
function caretAfterSignificant(formatted: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (SIGNIFICANT.test(formatted[i] as string)) seen += 1;
    if (seen === count) return i + 1;
  }
  return formatted.length;
}

/**
 * Розставляє роздільники в цілій частині. Дробову лишає як є — разом із
 * незавершеною комою («82,»), заради якої існує `useDecimalDraft`.
 */
export function groupIntegerDigits(raw: string): string {
  const decimalAt = raw.search(/[.,]/);
  const head = stripSeparators(
    decimalAt === -1 ? raw : raw.slice(0, decimalAt),
  );
  const tail = decimalAt === -1 ? "" : stripSeparators(raw.slice(decimalAt));
  return head.replace(/\B(?=(\d{3})+$)/g, GROUP_SEPARATOR) + tail;
}

/**
 * Перегруповує вміст поля НА МІСЦІ й лишає курсор там, де його бачить
 * користувач. Повертає новий текст — для тих викликачів, що тримають його
 * ще й у стані React.
 *
 * `previousValue` потрібне рівно для одного випадку: Backspace/Delete на
 * роздільнику. Роздільник поставили ми, і без цієї гілки він просто
 * зʼявився б назад — клавіша виглядала б зламаною. Якщо набір цифр не
 * змінився, а рядок став коротшим, значить стерли роздільник; тоді
 * прибираємо цифру перед курсором, як користувач і розраховував.
 */
export function applyDigitGrouping(
  el: HTMLInputElement,
  previousValue: string,
): string {
  const position = el.selectionStart ?? el.value.length;
  let raw = el.value;
  let significantBefore = countSignificant(raw.slice(0, position));

  const separatorDeleted =
    position > 0 &&
    raw.length < previousValue.length &&
    stripSeparators(raw) === stripSeparators(previousValue);
  if (separatorDeleted) {
    significantBefore = countSignificant(raw.slice(0, position - 1));
    raw = raw.slice(0, position - 1) + raw.slice(position);
  }

  const next = groupIntegerDigits(raw);
  // Пишемо в DOM синхронно, ще в обробнику: React звіряє `node.value` з
  // пропом перед записом, тож наше значення переживе ре-рендер, а каретка
  // не буде скинута в кінець. Це ж рятує випадок, коли текст стану не
  // змінився (ввели зайвий пробіл) і ре-рендеру взагалі не буде.
  if (el.value !== next) el.value = next;
  const caret = caretAfterSignificant(next, significantBefore);
  el.setSelectionRange(caret, caret);
  return next;
}
