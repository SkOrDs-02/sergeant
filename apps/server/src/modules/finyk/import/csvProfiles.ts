import type { ImportColumnMapping, ImportDateFormat } from "@sergeant/shared";

/**
 * Автопрофілі відомих банківських виписок (mono, Privat24) + резолюція
 * клієнтського `mapping` для невідомих форматів.
 *
 * Обидва профілі ЗВІРЕНІ з реальними файлами: mono — live-прогін
 * 2026-08-18 (255/255 рядків, 0 skip), Privat24 — XLSX «Історія операцій
 * за період» з мобільного застосунку, 2026-08-25. Самі виписки в репо НЕ
 * лежать (реальні фінансові дані, репо публічне) — у тестах синтетичні
 * рядки під СПРАВЖНІМИ заголовками.
 *
 * Детекція навмисно ТОЛЕРАНТНА (підрядок, не точний збіг усього
 * заголовка) — стійкіша до дрейфу форматулювання банку, ніж крихкий
 * exact-match. Якщо новий експорт розійдеться — правити ЛИШЕ фрагменти
 * заголовків нижче: решта (tokenizer, XLSX-ридер, amount/date-парсинг)
 * від конкретних назв колонок не залежить.
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
  /** Колонка з ВЛАСНОЮ категорією банку (Privat24 «Категорія»), якщо
   * профіль її знає. `null` — банк категорію не друкує. Живить
   * `categoryHint.ts`; на розбір суми/дати не впливає. */
  categoryColIndex: number | null;
  /** Колонка MCC (ISO 18245) — є в mono («МСС»). Другий за надійністю
   * доказ категорії після власної розмітки банку. */
  mccColIndex: number | null;
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

/** Перший фрагмент зі списку, який знайшовся — за пріоритетом у списку, а
 * не за порядком колонок у файлі: виписка може нести обидва варіанти
 * підпису, і треба саме той, що заміряний на живому файлі. */
/** `findColumnIndex`, але `null` замість `-1` — для опційних колонок,
 * відсутність яких не є помилкою профілю. */
function findColumnIndexOrNull(
  normalizedHeaders: string[],
  fragment: string,
): number | null {
  const idx = findColumnIndex(normalizedHeaders, fragment);
  return idx === -1 ? null : idx;
}

function findFirstColumnIndex(
  normalizedHeaders: string[],
  fragments: readonly string[],
): number {
  for (const fragment of fragments) {
    const idx = findColumnIndex(normalizedHeaders, fragment);
    if (idx !== -1) return idx;
  }
  return -1;
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
    // mono власної категорії не друкує, але друкує MCC — і це той самий
    // каталог, яким категоризується mono-вебхук у проді.
    categoryColIndex: null,
    mccColIndex: findColumnIndexOrNull(normalizedHeaders, "мсс"),
    dateFormat: "DD.MM.YYYY",
    decimalComma: false,
  };
}

/**
 * Privat24 — «Історія операцій за період» (звірено з реальним XLSX,
 * 2026-08-25). Фактичні колонки:
 *
 *   Дата | Категорія | Картка | Опис операції | Сума в валюті картки |
 *   Валюта картки | Сума в валюті транзакції | Валюта транзакції |
 *   Залишок на кінець періоду | Валюта залишку
 *
 * Три речі, які видно лише на живому файлі і які визначають вибір колонок:
 *
 * 1. **Сума береться з «валюті КАРТКИ», не «валюті транзакції».** Лише
 *    перша несе ЗНАК (`-141.4` витрата, `20000` дохід); друга — модуль
 *    (`141.4`), тобто напрям із неї не відновити взагалі.
 * 2. **Валютний фільтр — теж по КАРТЦІ.** У виписці є рядки Apple з
 *    «Валюта транзакції = USD» при «Валюта картки = UAH»: це звичайні
 *    покупки гривневою карткою, і фільтр по валюті ТРАНЗАКЦІЇ викинув би
 *    їх як `not_uah`. Колонка валюти картки лишається осмисленою, бо сама
 *    картка може бути відкрита в USD/EUR.
 * 3. **Десятковий роздільник — крапка, не кома** (`-1366.82`), попри
 *    український локаль файлу. Але жорстко його НЕ форсуємо: заміряний
 *    формат — XLSX, а який роздільник у CSV-експорті того ж банку,
 *    доказів немає. Автодетект `parseSignedAmountKopiykas` однаково
 *    правильно читає і `-141.4`, і `-141,4`.
 *
 * Фрагмент «рахунку» лишений запасним варіантом: виписка по РАХУНКУ (не
 * картці) в кабінеті підписує колонки саме так, і живого файлу такого
 * типу поки не бачили.
 */
function detectPrivat24Profile(
  normalizedHeaders: string[],
): ResolvedColumnMapping | null {
  const dateColIndex = findColumnIndex(normalizedHeaders, "дата");
  const amountColIndex = findFirstColumnIndex(normalizedHeaders, [
    "сума в валюті картки",
    "сума в валюті рахунку",
  ]);
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
  const currencyColIndex = findFirstColumnIndex(normalizedHeaders, [
    "валюта картки",
    "валюта рахунку",
  ]);
  return {
    dateColIndex,
    amountColIndex,
    descriptionColIndex,
    currencyColIndex: currencyColIndex === -1 ? null : currencyColIndex,
    // «Категорія» — власна розмітка банку, найнадійніший доказ категорії
    // (`categoryHint.ts`). У живому XLSX 2026-08-25 вона є в кожному рядку.
    categoryColIndex: findColumnIndexOrNull(normalizedHeaders, "категорія"),
    mccColIndex: null,
    dateFormat: "DD.MM.YYYY",
    // `undefined` = автодетект, свідомо (див. п.3 у докблоці вище).
    decimalComma: undefined,
  };
}

/**
 * Пробує mono, потім Privat24. Розрізняє їх колонка ОПИСУ, а не суми:
 * після звірки з реальним Privat24-XLSX (2026-08-25) виявилось, що обидва
 * банки підписують суму «Сума в валюті картки». Але mono вимагає «Деталі
 * операції», Privat24 — «Опис операції», і жоден із двох файлів не несе
 * обидва підписи одночасно, тож сигнатури лишаються неперетинними.
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
 * mapping. `null`, якщо будь-яка з трьох обовʼязкових колонок не
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
    // Контракт `ImportColumnMapping` колонок категорії/MCC не має —
    // довільний CSV ними не розмічений. Підказка для таких файлів
    // лишається на третьому шарі `categoryHint.ts` (ключові слова опису).
    categoryColIndex: null,
    mccColIndex: null,
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
