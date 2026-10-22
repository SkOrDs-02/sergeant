/**
 * Фінансовий парсер суми для масового імпорту. Generic CSV-примітиви
 * живуть у `@sergeant/tabular-import`.
 *
 * Десятковий і тисячний роздільник (data-31) визначаються ПО КОЛОНЦІ, а не
 * по клітинці: «1,234» саме по собі — це і 1234 (кома тисяч), і 1,234 (кома
 * десяткова), різниця у 1000 разів. Відповідь дають сусідні значення колонки
 * («12,50» ⇒ кома десяткова, «1,234.56» ⇒ крапка десяткова), тому спершу
 * `inferDecimalSeparator` читає всю колонку, а потім кожна клітинка
 * парситься з її підсумком. Якщо колонка відповіді не дає, неоднозначну
 * клітинку відхиляємо (`null` ⇒ skip `unparsed_amount` з рядком у ревʼю), а
 * не вгадуємо мовчки.
 */

export type DecimalSeparator = "," | ".";

interface ParsedCell {
  negative: boolean;
  int: string;
  frac: string;
  /** Роздільник, який ця клітинка ОДНОЗНАЧНО показує десятковим. */
  evidence?: DecimalSeparator;
  /** Єдиний роздільник рівно з трьома цифрами після нього («1,234»): тисячі
   * чи дріб — з самої клітинки не вирішити. */
  ambiguous?: DecimalSeparator;
}

/** Група тисяч: 1-3 цифри, далі кожна група рівно по 3 (без нуля попереду). */
function isGroupedInt(intPart: string, thousands: string): boolean {
  const groups = intPart.split(thousands);
  const first = groups[0] ?? "";
  if (!/^\d{1,3}$/.test(first)) return false;
  if (groups.length > 1 && first.length > 1 && first.startsWith("0")) {
    return false;
  }
  return groups.slice(1).every((g) => /^\d{3}$/.test(g));
}

function other(sep: DecimalSeparator): DecimalSeparator {
  return sep === "," ? "." : ",";
}

function parseCell(raw: string): ParsedCell | null {
  let s = raw
    .trim()
    .replace(/[\s\u00A0\u202F]+/g, "")
    .replace(/\u2212/g, "-")
    .replace(/(uah|грн\.?|₴)/gi, "");
  let negative = false;
  // Бухгалтерський мінус: «(95,50)».
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) {
    s = paren[1] ?? "";
    negative = true;
  }
  const sign = /^[+-]/.exec(s)?.[0];
  if (sign) {
    s = s.slice(1);
    if (sign === "-") negative = !negative;
  }
  // Лише цифри й роздільники: «0x10», «1e3», «Infinity» — службовий текст, а
  // не сума. Починається й закінчується цифрою.
  if (!/^\d[\d.,]*\d$|^\d$/.test(s)) return null;

  const dots = s.split(".").length - 1;
  const commas = s.split(",").length - 1;

  if (dots > 0 && commas > 0) {
    const dec: DecimalSeparator =
      s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thou = other(dec);
    const parts = s.split(dec);
    if (parts.length !== 2) return null;
    const [intPart = "", frac = ""] = parts;
    if (!isGroupedInt(intPart, thou) || !/^\d+$/.test(frac)) return null;
    return {
      negative,
      int: intPart.split(thou).join(""),
      frac,
      evidence: dec,
    };
  }

  const sep: DecimalSeparator | null = dots > 0 ? "." : commas > 0 ? "," : null;
  if (sep === null) return { negative, int: s, frac: "" };

  const count = sep === "." ? dots : commas;
  if (count > 1) {
    // Повторюваний роздільник може бути лише тисячним: «1,234,567».
    if (!isGroupedInt(s, sep)) return null;
    return {
      negative,
      int: s.split(sep).join(""),
      frac: "",
      evidence: other(sep),
    };
  }

  const [intPart = "", frac = ""] = s.split(sep);
  const couldBeThousands =
    frac.length === 3 && intPart.length <= 3 && !intPart.startsWith("0");
  if (couldBeThousands) {
    return { negative, int: intPart, frac, ambiguous: sep };
  }
  return { negative, int: intPart, frac, evidence: sep };
}

/**
 * Який десятковий роздільник використовує колонка. Дивиться на ВСІ значення
 * і бере лише однозначні докази (`evidence`); неоднозначні «1,234» голосу не
 * мають. `undefined` — доказів немає (усі цілі або лише неоднозначні),
 * `"mixed"` — у колонці є докази обох видів (файл зібраний із різних
 * джерел), тоді жодну неоднозначну клітинку вгадувати не можна.
 */
export function inferDecimalSeparator(
  values: readonly string[],
): DecimalSeparator | "mixed" | undefined {
  const seen = new Set<DecimalSeparator>();
  for (const v of values) {
    const cell = parseCell(v);
    if (cell?.evidence) seen.add(cell.evidence);
  }
  if (seen.size > 1) return "mixed";
  return seen.values().next().value;
}

/**
 * Парсить суму в копійки (зі знаком) або `null`.
 *
 * `decimalComma` — підсумок по колонці (`inferDecimalSeparator`) або явний
 * вибір користувача; використовується ЛИШЕ для клітинок, які самі себе не
 * розрізняють («1,234»). Однозначна клітинка («12,50», «1,234.56»,
 * «1.234,56») завжди читається за собою: підказка не може зробити з неї
 * хибне число. Неоднозначна клітинка за відсутності підказки, а також коли
 * підказка робить її дробом із трьома знаками («1,234» при кому-десятковій),
 * дає `null`.
 */
export function parseSignedAmountKopiykas(
  raw: string,
  opts: { decimalComma?: boolean | undefined } = {},
): number | null {
  const cell = parseCell(raw);
  if (!cell) return null;

  let { int, frac } = cell;
  if (cell.ambiguous) {
    if (opts.decimalComma === undefined) return null;
    const decimal: DecimalSeparator = opts.decimalComma ? "," : ".";
    // Роздільник клітинки є десятковим за підказкою ⇒ «1,234» — це 1,234 з
    // трьома знаками, не гроші; відхиляємо. Інакше він тисячний.
    if (cell.ambiguous === decimal) return null;
    int = int + frac;
    frac = "";
  }
  // Довгий дробовий хвіст («12.300000000000001» з типізованої XLSX-клітинки)
  // свідомо проходить: `Math.round` його зводить до копійок.
  const n = Number(frac ? `${int}.${frac}` : int);
  if (!Number.isFinite(n)) return null;
  const kopiykas = Math.round(n * 100);
  return cell.negative && kopiykas !== 0 ? -kopiykas : kopiykas;
}
