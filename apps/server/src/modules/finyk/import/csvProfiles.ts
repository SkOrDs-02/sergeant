import type { ImportColumnMapping, ImportDateFormat } from "@sergeant/shared";

/**
 * Автопрофілі відомих банківських CSV-виписок (mono, Privat24) +
 * резолюція клієнтського `mapping` для невідомих форматів.
 *
 * AI-DANGER: РЕАЛЬНИХ фікстур цих експортів немає (research не підтвердив
 * точну структуру — той самий гейт, що `docs/90-work/initiatives/
 * 0022-import-from-external-trackers.md` § План змін → Фаза 3: "Privat24 —
 * формат виписки звірити окремо"). Заголовки нижче — обґрунтована
 * реконструкція за загальновідомим форматом експорту (mono: "Виписка" з
 * мобільного/веб-кабінету; Privat24: "Виписка" з особистого кабінету), НЕ
 * підтверджена реальним файлом — той самий підхід, що
 * `receipts/dpsXml.ts` для ДПС XML. Детекція навмисно зроблена ТОЛЕРАНТНОЮ
 * (підрядок, не точний збіг усього заголовка) — стійкіша до дрейфу
 * форматулювання банку, ніж крихкий exact-match. Якщо перший реальний
 * файл розійдеться — правити ЛИШЕ `HEADER_FRAGMENTS` нижче, решта
 * (tokenizer, amount/date-парсинг) від конкретних назв колонок не
 * залежить.
 */

export type CsvProfileId = "mono" | "privat24";

export interface ResolvedColumnMapping {
  dateColIndex: number;
  amountColIndex: number;
  descriptionColIndex: number;
  /** Індекс колонки валюти рахунку — лише автопрофілі можуть її нести
   * (клієнтський custom `mapping` контракту currency-колонки не має, спека
   * Фази 2 явно не вгадує валюту для довільних CSV — див. `not_uah` нижче
   * і `docs/90-work/initiatives/0022-import-from-external-trackers.md`
   * § Відкриті рішення №4). `null` — рядки цього профілю не фільтруються
   * за валютою (mono: amount-колонка вже гарантовано UAH за побудовою
   * картки, currency-check дав би ХИБНИЙ skip для закордонних покупок
   * UAH-карткою — див. коментар нижче). */
  currencyColIndex: number | null;
  /** `undefined` — немає фіксованого формату, `parseCalendarDateKey`
   * автодетектить (ISO `-` роздільник vs `DD.MM.YYYY` `.` роздільник) на
   * кожен рядок окремо. Автопрофілі (mono/Privat24) завжди задають
   * ЯВНИЙ формат (знають своє джерело); custom-mapping без явного
   * `mapping.dateFormat` НЕ повинен форсувати один формат — інакше
   * легітимний ISO-рядок під форсованим "DD.MM.YYYY"-хінтом мовчки стає
   * `unparsed_date` (знайдено на тесті: жорсткий дефолт "DD.MM.YYYY" тут
   * раніше глушив авто-детект `parseCalendarDateKey`, коли клієнт узагалі
   * не передав `dateFormat`). */
  dateFormat: ImportDateFormat | undefined;
  /** `undefined` — автодетект десяткового роздільника на кожне значення
   * окремо. Так само, як `dateFormat` вище: жорстка підказка описує
   * ДРУКОВАНИЙ формат банку і на канонічних числах з типізованих клітинок
   * XLSX (`-1234.56`) дала б протилежний результат, тому
   * `statementPreview.ts` знімає її для сіток `sourceKind: "sheet"`. */
  decimalComma: boolean | undefined;
}

/**
 * Знімає з мапи жорсткі підказки формату дати й десяткового роздільника,
 * лишаючи автодетект. Викликається для сіток, які прийшли з ТИПІЗОВАНИХ
 * клітинок (XLSX): там дата й сума вже канонічні (`2026-08-16`,
 * `-1234.56`), і підказка «Privat24 друкує DD.MM.YYYY і кому» зробила б із
 * валідного рядка `unparsed_date` та зіпсувала б суму в 100 разів.
 * Див. `statementFile.ts` § `StatementSourceKind`.
 */
export function withAutodetectedFormats(
  mapping: ResolvedColumnMapping,
): ResolvedColumnMapping {
  return { ...mapping, dateFormat: undefined, decimalComma: undefined };
}

export interface DetectedProfile {
  profile: CsvProfileId;
  mapping: ResolvedColumnMapping;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumnIndex(
  normalizedHeaders: string[],
  fragment: string,
): number {
  return normalizedHeaders.findIndex((h) => h.includes(fragment));
}

/**
 * mono: "Виписка" з кабінету — comma-delimited, дата+час `DD.MM.YYYY
 * HH:MM:SS`, сума в UAH-колонці dot-decimal, без роздільника тисяч у
 * типовому одноденному експорті. Amount-колонка обрана як "сума в валюті
 * КАРТКИ (UAH)", НЕ "сума в валюті операції" — картка сама по собі
 * UAH-деномінована, тож ця колонка вже конвертована в UAH банком
 * незалежно від валюти мерчанта; фільтр по "валюта операції" помилково
 * скипав би легітимні закордонні покупки UAH-карткою — тому
 * `currencyColIndex: null` для цього профілю (жоден `not_uah` skip з mono
 * не походить).
 */
function detectMonoProfile(
  normalizedHeaders: string[],
): ResolvedColumnMapping | null {
  const dateColIndex = findColumnIndex(normalizedHeaders, "дата");
  const amountColIndex = findColumnIndex(
    normalizedHeaders,
    "сума в валюті картки",
  );
  const descriptionColIndex = findColumnIndex(
    normalizedHeaders,
    "деталі операції",
  );
  if (
    dateColIndex === -1 ||
    amountColIndex === -1 ||
    descriptionColIndex === -1
  ) {
    return null;
  }
  return {
    dateColIndex,
    amountColIndex,
    descriptionColIndex,
    currencyColIndex: null,
    dateFormat: "DD.MM.YYYY",
    decimalComma: false,
  };
}

/**
 * Privat24: "Виписка" з особистого кабінету — semicolon-delimited (типово
 * для excel-орієнтованого укр. локалю), дата `DD.MM.YYYY`, сума в
 * УКРАЇНСЬКІЙ excel-конвенції (кома-десятковий). "Сума в валюті рахунку" —
 * колонка суми РАХУНКУ (не операції), тому саме вона годиться як
 * amount-джерело для мультивалютних клієнтів; поруч є "Валюта рахунку" —
 * єдина колонка, де перевірка на UAH семантично коректна (рахунок сам по
 * собі може бути відкритий у USD/EUR, на відміну від mono-картки вище).
 */
function detectPrivat24Profile(
  normalizedHeaders: string[],
): ResolvedColumnMapping | null {
  const dateColIndex = findColumnIndex(normalizedHeaders, "дата");
  const amountColIndex = findColumnIndex(
    normalizedHeaders,
    "сума в валюті рахунку",
  );
  const descriptionColIndex = findColumnIndex(
    normalizedHeaders,
    "опис операції",
  );
  if (
    dateColIndex === -1 ||
    amountColIndex === -1 ||
    descriptionColIndex === -1
  ) {
    return null;
  }
  const currencyColIndex = findColumnIndex(normalizedHeaders, "валюта рахунку");
  return {
    dateColIndex,
    amountColIndex,
    descriptionColIndex,
    currencyColIndex: currencyColIndex === -1 ? null : currencyColIndex,
    dateFormat: "DD.MM.YYYY",
    decimalComma: true,
  };
}

/**
 * Пробує mono, потім Privat24 (порядок нейтральний — сигнатури не
 * перетинаються: mono вимагає "сума в валюті картки", Privat24 — "сума в
 * валюті рахунку", жоден заголовок не задовольняє обидва фрагменти
 * одночасно).
 */
export function detectCsvProfile(headers: string[]): DetectedProfile | null {
  const normalized = headers.map(normalizeHeader);

  const mono = detectMonoProfile(normalized);
  if (mono) return { profile: "mono", mapping: mono };

  const privat24 = detectPrivat24Profile(normalized);
  if (privat24) return { profile: "privat24", mapping: privat24 };

  return null;
}

/**
 * Резолвить клієнтський `mapping` (точний текст заголовка з попереднього
 * `needsMapping: true` → `headers[]`) у позиційні індекси. Порівняння —
 * case/whitespace-толерантне (той самий `normalizeHeader`), щоб
 * copy-paste заголовка з невеликою відмінністю в регістрі не провалював
 * mapping. `null`, якщо будь-яка з трьох обов'язкових колонок не
 * знайдена серед `headers`.
 *
 * Custom mapping НЕ несе currency-колонку (контракт `ImportColumnMapping`,
 * `@sergeant/shared`) — валютна нормалізація довільних CSV навмисно НЕ
 * вгадується (0022 § Відкриті рішення №4), тож `currencyColIndex` завжди
 * `null` тут — `not_uah` skip для custom-mapping рядків не спрацьовує.
 */
export function resolveCustomMapping(
  headers: string[],
  mapping: ImportColumnMapping,
): ResolvedColumnMapping | null {
  const normalized = headers.map(normalizeHeader);
  const dateColIndex = normalized.indexOf(normalizeHeader(mapping.dateCol));
  const amountColIndex = normalized.indexOf(normalizeHeader(mapping.amountCol));
  const descriptionColIndex = normalized.indexOf(
    normalizeHeader(mapping.descriptionCol),
  );
  if (
    dateColIndex === -1 ||
    amountColIndex === -1 ||
    descriptionColIndex === -1
  ) {
    return null;
  }
  return {
    dateColIndex,
    amountColIndex,
    descriptionColIndex,
    currencyColIndex: null,
    // НЕ дефолтити на "DD.MM.YYYY" — без явного `mapping.dateFormat`
    // лишаємо `undefined`, щоб `parseCalendarDateKey` автодетектив формат
    // на кожен рядок окремо (див. docstring `ResolvedColumnMapping.dateFormat`).
    dateFormat: mapping.dateFormat,
    // Так само НЕ дефолтимо на `false`: без явного вибору користувача
    // автодетект `parseSignedAmountKopiykas` читає і "1 234,56", і
    // "-1234.56" правильно, а форсована крапка мовчки перетворювала
    // українську кому на роздільник тисяч ("12,50" → 1250 грн).
    decimalComma: mapping.decimalComma,
  };
}

/** Чи нормалізується значення `currencyCol` до гривні. Толерує "UAH",
 * "грн"/"грн.", код валюти "980" (ISO 4217) — усі варіанти, якими банки
 * реально підписують гривню в CSV. */
export function isUahCurrencyValue(raw: string): boolean {
  const v = raw.trim().toLowerCase().replace(/\.$/, "");
  return v === "uah" || v === "грн" || v === "980" || v === "";
}
