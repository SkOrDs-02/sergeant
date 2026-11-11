/**
 * Лінійний пошук елементів `<name …>тіло</name>` і `<name …/>` у сирому
 * тексті розмітки.
 *
 * Замінює регекспи виду `<tr\b[^>]*>([\s\S]*?)<\/tr>`: на незакритому тезі
 * лінивий квантор дочитує рядок до кінця з КОЖНОГО старту, тож 5 МБ
 * `<tr><tr><tr>…` без жодного `</tr>` дають квадратичний CPU у синхронному
 * серверному запиті. Тут кожна позиція тексту переглядається сталу
 * кількість разів: перший `>` і перший закривний тег після поточного місця
 * кешуються, і щойно закривного тега далі немає, усі наступні старти того
 * самого імені відкидаються без пошуку.
 *
 * Семантика збігається з регекспом: атрибути до першого `>`, тіло до
 * ПЕРШОГО закривного тега того самого імені (вкладеність не враховується),
 * після невдалого старту пошук іде з наступного символу.
 */

export interface ScannedElement {
  /** Імʼя тега в нижньому регістрі для `ignoreCase`, інакше як у тексті. */
  name: string;
  /** Текст між імʼям і `>` (без `/` самозакривного тега). */
  attrs: string;
  /** `null` для самозакривного `<name …/>`. */
  body: string | null;
  /** Межі всього елемента в `src`: `[start, end)`. */
  start: number;
  end: number;
}

export interface ScanOptions {
  /** HTML: імʼя закривного тега порівнюється без урахування регістру. */
  ignoreCase?: boolean;
  /** XML: `<name …/>` - готовий елемент без тіла. */
  selfClosing?: boolean;
}

function findClose(
  src: string,
  needle: string,
  from: number,
  ignoreCase: boolean,
): number {
  if (!ignoreCase) return src.indexOf(needle, from);
  for (
    let i = src.indexOf("</", from);
    i !== -1;
    i = src.indexOf("</", i + 2)
  ) {
    if (src.slice(i, i + needle.length).toLowerCase() === needle) return i;
  }
  return -1;
}

/**
 * `openRe` - глобальний регексп на початок тега з межею імені, група 1 -
 * імʼя (`/<(tr)\b/gi`, `/<(row)(?=\s|\/?>)/g`). Сам він лінійний: у ньому
 * немає квантора, що міг би дочитувати текст.
 */
export function* scanElements(
  src: string,
  openRe: RegExp,
  opts: ScanOptions = {},
): Generator<ScannedElement> {
  const ignoreCase = opts.ignoreCase === true;
  const closeAt = new Map<string, number>();
  let gt = -1;
  // Позиція тримається локально, а не в `openRe.lastIndex`: генератор
  // лінивий, і викликач між кроками може ганяти той самий регексп.
  let pos = 0;

  for (;;) {
    openRe.lastIndex = pos;
    const m = openRe.exec(src);
    if (m === null) return;
    const start = m.index;
    const nameEnd = start + m[0].length;
    if (gt < nameEnd) {
      gt = src.indexOf(">", nameEnd);
      // Без `>` далі не завершиться жоден відкривальний тег.
      if (gt === -1) return;
    }
    const raw = m[1] ?? "";
    const name = ignoreCase ? raw.toLowerCase() : raw;

    if (opts.selfClosing === true && src[gt - 1] === "/") {
      yield {
        name,
        attrs: src.slice(nameEnd, gt - 1),
        body: null,
        start,
        end: gt + 1,
      };
      pos = gt + 1;
      continue;
    }

    const needle = `</${name}>`;
    let close = closeAt.get(name);
    if (close === undefined || (close !== -1 && close <= gt)) {
      close = findClose(src, needle, gt + 1, ignoreCase);
      closeAt.set(name, close);
    }
    if (close === -1) {
      pos = start + 1;
      continue;
    }
    const end = close + needle.length;
    yield {
      name,
      attrs: src.slice(nameEnd, gt),
      body: src.slice(gt + 1, close),
      start,
      end,
    };
    pos = end;
  }
}

/** Перший елемент або `undefined` (заміна неглобального `re.exec`). */
export function firstElement(
  src: string,
  openRe: RegExp,
  opts?: ScanOptions,
): ScannedElement | undefined {
  for (const el of scanElements(src, openRe, opts)) return el;
  return undefined;
}
