/**
 * Скриншоти виписок і «не документ» для зорового стенду — продовження
 * `visionDocs.data.ts` (винесено, щоб файл даних тримав стелю 600 рядків).
 *
 * AI-DANGER: публічне репо. Банк, мерчанти, маски карток, імена — вигадані.
 */

// ── Скриншоти виписок ───────────────────────────────────────────────

/**
 * «Сьогодні» для якоря дат без року. Прод бере київський день виклику;
 * стенд фіксує його, інакше істина «Вчора» чи «31 грудня» дрейфувала б
 * разом із датою прогону.
 */
export const STATEMENT_TODAY = "2026-11-19";

export interface StatementRow {
  /** Заголовок групи або дата в рядку — так, як намальовано. */
  shownDate: string;
  /** Істина: `YYYY-MM-DD`. */
  date: string;
  time?: string;
  description: string;
  /** Підрядок, який має вижити в описі (нижній регістр). */
  descKey: string;
  /** Копійки зі знаком: мінус — списання, плюс — надходження. */
  amount: number;
  currency?: "UAH" | "EUR" | "USD";
  /** Позначено як невдала операція — гроші не рухались. */
  failed?: boolean;
  /** Суму перекрито кнопкою: на зображенні її немає. */
  amountHidden?: boolean;
  /** Переказ між власними рахунками: прод-детектор має його впізнати. */
  ownTransfer?: boolean;
  category?: string;
}

export type StatementStyle = "app-light" | "app-dark" | "table" | "chat";

export interface StatementDoc {
  key: string;
  style: StatementStyle;
  bank: string;
  /** Рядок балансу вгорі — пастка «баланс ≠ операція». */
  balance?: string;
  rows: StatementRow[];
}

/** Рядки, які прод-нормалізатор має лишити (UAH, не невдалі, з сумою). */
export function expectedStatementRows(doc: StatementDoc): StatementRow[] {
  return doc.rows.filter(
    (r) => !r.failed && !r.amountHidden && (r.currency ?? "UAH") === "UAH",
  );
}

export const STATEMENTS: StatementDoc[] = [
  {
    key: "app-light",
    style: "app-light",
    bank: "Каштан Банк",
    balance: "23 456,78 ₴",
    rows: [
      {
        shownDate: "Сьогодні",
        date: "2026-11-19",
        time: "09:12",
        description: "Кавʼярня «Тиха Ложка»",
        descKey: "тиха ложка",
        amount: -13600,
        category: "Кафе",
      },
      {
        shownDate: "Сьогодні",
        date: "2026-11-19",
        time: "08:05",
        description: "Метро. Проїзд",
        descKey: "метро",
        amount: -1500,
        category: "Транспорт",
      },
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "19:44",
        description: "Супермаркет «Комора Петрівна»",
        descKey: "комора",
        amount: -84750,
        category: "Продукти",
      },
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "10:00",
        description: "Зарплата ТОВ «Вигадка»",
        descKey: "зарплата",
        amount: 3450000,
        category: "Надходження",
      },
      {
        shownDate: "17 листопада",
        date: "2026-11-17",
        time: "21:30",
        description: "Кінотеатр «Ілюзіон-Демо»",
        descKey: "ілюзіон",
        amount: -32000,
        category: "Розваги",
      },
      {
        shownDate: "17 листопада",
        date: "2026-11-17",
        time: "13:18",
        description: "Аптека «Ромашкова 24»",
        descKey: "ромашкова",
        amount: -27965,
        category: "Здоровʼя",
      },
      {
        shownDate: "17 листопада",
        date: "2026-11-17",
        time: "07:51",
        description: "Таксі «Вжух»",
        descKey: "вжух",
        amount: -18900,
        category: "Транспорт",
      },
      {
        shownDate: "16 листопада",
        date: "2026-11-16",
        time: "15:02",
        description: "Кешбек за жовтень",
        descKey: "кешбек",
        amount: 4120,
        category: "Надходження",
      },
    ],
  },
  {
    key: "app-dark",
    style: "app-dark",
    bank: "Каштан Банк",
    balance: "1 204,10 ₴",
    rows: [
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "22:10",
        description: "Онлайн-кінотеатр «Мерехтіння»",
        descKey: "мерехтіння",
        amount: -19900,
        failed: true,
        category: "Недостатньо коштів на картці",
      },
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "18:20",
        description: "Піцерія «Скибка»",
        descKey: "скибка",
        amount: -42500,
        category: "Кафе",
      },
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "12:03",
        description: "Мобільний звʼязок",
        descKey: "мобільн",
        amount: -25000,
        category: "Звʼязок",
      },
      {
        shownDate: "4 січня",
        date: "2026-01-04",
        time: "16:45",
        description: "Книгарня «Сторінка»",
        descKey: "сторінка",
        amount: -38900,
        category: "Покупки",
      },
      {
        shownDate: "31 грудня",
        date: "2025-12-31",
        time: "20:15",
        description: "Переказ від Олени",
        descKey: "олени",
        amount: 150000,
        category: "Перекази",
      },
      {
        shownDate: "31 грудня",
        date: "2025-12-31",
        time: "11:30",
        description: "Квітковий салон «Півонія-Демо»",
        descKey: "півонія",
        amount: -64000,
        category: "Покупки",
      },
    ],
  },
  {
    key: "table",
    style: "table",
    bank: "Каштан Банк",
    rows: [
      {
        shownDate: "03.11.2026",
        date: "2026-11-03",
        time: "10:14",
        description: "Оплата комунальних послуг",
        descKey: "комунальн",
        amount: -235047,
      },
      {
        shownDate: "04.11.2026",
        date: "2026-11-04",
        time: "09:00",
        description: "Надходження зарплати",
        descKey: "зарплат",
        amount: 3450000,
      },
      {
        shownDate: "05.11.2026",
        date: "2026-11-05",
        time: "13:31",
        description: "Супермаркет «Лелека»",
        descKey: "лелека",
        amount: -125630,
      },
      {
        shownDate: "06.11.2026",
        date: "2026-11-06",
        time: "19:02",
        description: "Спортзал «Залізо-Демо», абонемент",
        descKey: "залізо",
        amount: -90000,
      },
      {
        shownDate: "07.11.2026",
        date: "2026-11-07",
        time: "08:47",
        description: "Автозаправка «Пальне+»",
        descKey: "пальне",
        amount: -160000,
      },
      {
        shownDate: "08.11.2026",
        date: "2026-11-08",
        time: "14:20",
        description: "Повернення коштів за замовлення",
        descKey: "повернення",
        amount: 29900,
      },
      {
        shownDate: "09.11.2026",
        date: "2026-11-09",
        time: "11:07",
        description: "Гіпермаркет «Лелека»",
        descKey: "лелека",
        amount: -287316,
      },
      {
        shownDate: "10.11.2026",
        date: "2026-11-10",
        time: "17:55",
        description: "Інтернет-провайдер «Хвиля»",
        descKey: "хвиля",
        amount: -30000,
      },
      {
        shownDate: "11.11.2026",
        date: "2026-11-11",
        time: "12:12",
        description: "Ресторан «Вареник-Демо»",
        descKey: "вареник",
        amount: -76450,
      },
      {
        shownDate: "12.11.2026",
        date: "2026-11-12",
        time: "20:56",
        description: "Аптека «Ромашкова 24»",
        descKey: "ромашкова",
        amount: -63355,
      },
    ],
  },
  {
    key: "two-currency",
    style: "app-light",
    bank: "Каштан Банк",
    balance: "8 310,00 ₴ · 142,50 €",
    rows: [
      {
        shownDate: "Сьогодні",
        date: "2026-11-19",
        time: "10:40",
        description: "Пекарня «Окраєць»",
        descKey: "окраєць",
        amount: -8750,
        category: "Кафе",
      },
      {
        shownDate: "Сьогодні",
        date: "2026-11-19",
        time: "02:13",
        description: "Стрімінг «Мелодія»",
        descKey: "мелодія",
        amount: -999,
        currency: "EUR",
        category: "Підписки",
      },
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "16:05",
        description: "Готель «Привал-Демо», Краків",
        descKey: "привал",
        amount: -12000,
        currency: "EUR",
        category: "Подорожі",
      },
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "09:30",
        description: "Супермаркет «Комора Петрівна»",
        descKey: "комора",
        amount: -51290,
        category: "Продукти",
      },
      {
        shownDate: "15 листопада",
        date: "2026-11-15",
        time: "18:00",
        description: "Хмарне сховище «Хмаринка»",
        descKey: "хмаринка",
        amount: -299,
        currency: "USD",
        category: "Підписки",
      },
      {
        shownDate: "15 листопада",
        date: "2026-11-15",
        time: "12:44",
        description: "Аптека «Ромашкова 24»",
        descKey: "ромашкова",
        amount: -15600,
        category: "Здоровʼя",
      },
    ],
  },
  {
    key: "own-transfers",
    style: "app-light",
    bank: "Каштан Банк",
    balance: "4 980,00 ₴",
    rows: [
      {
        shownDate: "Сьогодні",
        date: "2026-11-19",
        time: "11:00",
        description: "Поповнення «На відпустку»",
        descKey: "на відпустку",
        amount: -200000,
        ownTransfer: true,
        category: "Скарбничка",
      },
      {
        shownDate: "Сьогодні",
        date: "2026-11-19",
        time: "09:25",
        description: "Продукти «Сім Кроків»",
        descKey: "сім кроків",
        amount: -34210,
        category: "Продукти",
      },
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "20:10",
        description: "Переказ на свою картку •• 0000",
        descKey: "свою картку",
        amount: -500000,
        ownTransfer: true,
        category: "Перекази",
      },
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "08:00",
        description: "Часткове зняття банки «На відпустку»",
        descKey: "зняття банки",
        amount: 100000,
        ownTransfer: true,
        category: "Скарбничка",
      },
      {
        shownDate: "16 листопада",
        date: "2026-11-16",
        time: "14:30",
        description: "Поповнення «Ремонт» від Андрія",
        descKey: "ремонт",
        amount: -50000,
        category: "Перекази",
      },
    ],
  },
  {
    key: "cut-row",
    style: "app-light",
    bank: "Каштан Банк",
    rows: [
      {
        shownDate: "Сьогодні",
        date: "2026-11-19",
        time: "13:10",
        description: "Їдальня «Компот»",
        descKey: "компот",
        amount: -9850,
        category: "Кафе",
      },
      {
        shownDate: "Сьогодні",
        date: "2026-11-19",
        time: "08:40",
        description: "Маршрутка №7-Демо",
        descKey: "маршрутка",
        amount: -2000,
        category: "Транспорт",
      },
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "18:15",
        description: "Зоомагазин «Хвіст»",
        descKey: "хвіст",
        amount: -45600,
        category: "Покупки",
      },
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "12:00",
        description: "Повернення боргу від Івана",
        descKey: "борг",
        amount: 70000,
        category: "Перекази",
      },
      {
        shownDate: "Вчора",
        date: "2026-11-18",
        time: "07:55",
        description: "Електроніка «Дріт-Демо»",
        descKey: "дріт",
        amount: -1299900,
        amountHidden: true,
        category: "Покупки",
      },
    ],
  },
];

/**
 * Не-виписка: скриншот месенджера з числами, схожими на суми. Рендериться
 * тим самим генератором, а кейс-пастку несуть обидва пайплайни
 * («не чек» і «не виписка»).
 */
export const CHAT_MESSAGES: Array<{ me: boolean; text: string; time: string }> =
  [
    {
      me: false,
      text: "Привіт! Скинь, будь ласка, 250 грн за піцу 🍕",
      time: "19:02",
    },
    { me: true, text: "Ок, зараз. А за таксі скільки?", time: "19:03" },
    { me: false, text: "Таксі було 180, ділимо навпіл — 90", time: "19:03" },
    { me: true, text: "Тоді разом 340, кидаю на картку", time: "19:05" },
    { me: false, text: "Дякую! У суботу о 15:30 біля фонтану?", time: "19:06" },
    { me: true, text: "Так, буду 👍", time: "19:07" },
  ];
