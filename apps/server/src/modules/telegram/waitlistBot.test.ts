import { describe, expect, it, vi } from "vitest";
import {
  buildSurveyKeyboard,
  CALLBACK_DATA_MAX_BYTES,
  countWaitlistStats,
  encodeSurveyCallback,
  formatStatsReply,
  isValidWebhookSecret,
  parseCommand,
  recordStart,
  recordStop,
  recordStopReason,
  recordSurveyAnswer,
  resolveUpdateOrigin,
  STOP_REASON_MAX_LEN,
} from "./waitlistBot.js";
import { startReplyQueued, SURVEYS, WEEKLY_PULSE_SURVEY } from "./betaTexts.js";

describe("parseCommand", () => {
  const msg = (text: string) => ({ message: { text } });

  it("читає /start без payload", () => {
    expect(parseCommand(msg("/start"))).toEqual({
      kind: "start",
      payload: null,
    });
  });

  it("читає payload deep link-а", () => {
    expect(parseCommand(msg("/start hero"))).toEqual({
      kind: "start",
      payload: "hero",
    });
  });

  it("знімає суфікс бота, який Telegram додає в групах", () => {
    expect(parseCommand(msg("/start@serg_qa_bot dou"))).toEqual({
      kind: "start",
      payload: "dou",
    });
  });

  it("відкидає payload поза набором Telegram", () => {
    // Такий payload не міг приїхати з deep link — це ручний ввід. У колонці
    // атрибуції йому не місце, але сам /start лишається валідним.
    expect(parseCommand(msg("/start <script>"))).toEqual({
      kind: "start",
      payload: null,
    });
    expect(parseCommand(msg(`/start ${"x".repeat(65)}`))).toEqual({
      kind: "start",
      payload: null,
    });
  });

  it("читає /stop", () => {
    expect(parseCommand(msg("/stop"))).toEqual({ kind: "stop" });
  });

  it("читає /stats (гейт за chat_id — у роутері, не тут)", () => {
    expect(parseCommand(msg("/stats"))).toEqual({ kind: "stats" });
    expect(parseCommand(msg("/stats@serg_qa_bot"))).toEqual({ kind: "stats" });
  });

  it("читає довідкові команди бети", () => {
    expect(parseCommand(msg("/app"))).toEqual({ kind: "app" });
    expect(parseCommand(msg("/install"))).toEqual({ kind: "install" });
    expect(parseCommand(msg("/help"))).toEqual({ kind: "help" });
    // Суфікс бота знімається так само, як для /start.
    expect(parseCommand(msg("/help@serg_qa_bot"))).toEqual({ kind: "help" });
    // Аргументи довідковим командам не потрібні й не ламають розбір.
    expect(parseCommand(msg("/install зараз"))).toEqual({ kind: "install" });
  });

  it("ігнорує порожнечу і апдейт без повідомлення", () => {
    expect(parseCommand(msg("   "))).toEqual({ kind: "ignore" });
    expect(parseCommand({})).toEqual({ kind: "ignore" });
  });

  it("віддає звичайний текст окремою гілкою — це може бути причина виходу", () => {
    // Раніше тут був `ignore`. Тепер текст доїжджає до роутера, а рішення
    // «чекаємо ми причину чи ні» ухвалює база — парсер стану не знає.
    expect(parseCommand(msg("дорого"))).toEqual({
      kind: "text",
      text: "дорого",
    });
  });

  it("невідома команда лишається тишею, а не причиною виходу", () => {
    // Людина явно зверталась до бота, а не пояснювала, чому йде. Записати
    // «/menu» як причину відвалу означало б зіпсувати єдину якісну метрику.
    expect(parseCommand(msg("/menu"))).toEqual({ kind: "ignore" });
    expect(parseCommand(msg("/start_over now"))).toEqual({ kind: "ignore" });
  });
});

describe("parseCommand — натискання inline-кнопки", () => {
  const cb = (data: string, extra: Record<string, unknown> = {}) => ({
    callback_query: {
      id: "cbq-1",
      from: { id: 7, is_bot: false },
      message: { message_id: 99, chat: { id: 7, type: "private" } },
      data,
      ...extra,
    },
  });

  it("читає відповідь на опитування", () => {
    expect(parseCommand(cb("s:week1:4"))).toEqual({
      kind: "survey",
      survey: WEEKLY_PULSE_SURVEY,
      answer: "4",
      callbackQueryId: "cbq-1",
      messageId: 99,
    });
  });

  it("відкидає опитування, якого немає в каталозі", () => {
    // Повідомлення з кнопками живе в чаті вічно. Через місяць хтось натисне
    // кнопку питання, вилученого з коду — і без звірки цей рядок осів би в
    // БД, зіпсувавши агрегат (FK його не спіймає: survey_id не має таблиці).
    expect(parseCommand(cb("s:week99:4"))).toEqual({ kind: "ignore" });
  });

  it("відкидає варіант, якого немає в питанні", () => {
    expect(parseCommand(cb("s:week1:9"))).toEqual({ kind: "ignore" });
    expect(parseCommand(cb("s:week1:"))).toEqual({ kind: "ignore" });
  });

  it("відкидає чужий префікс і зіпсований формат", () => {
    expect(parseCommand(cb("x:week1:4"))).toEqual({ kind: "ignore" });
    expect(parseCommand(cb("week1"))).toEqual({ kind: "ignore" });
  });

  it("без callback_query.id відповісти нікуди — ігноруємо", () => {
    // Без id не можна викликати answerCallbackQuery, тож кнопка все одно
    // крутила б годинник. Обробляти такий апдейт немає сенсу.
    const update = cb("s:week1:4");
    update.callback_query.id = "";
    expect(parseCommand(update)).toEqual({ kind: "ignore" });
  });

  it("переживає callback без прикріпленого повідомлення", () => {
    // Telegram не гарантує `message`: для старих повідомлень воно відсутнє.
    // Відповідь має зарахуватись — просто без редагування тексту.
    const parsed = parseCommand(cb("s:week1:2", { message: undefined }));
    expect(parsed).toMatchObject({ kind: "survey", messageId: null });
  });
});

describe("buildSurveyKeyboard", () => {
  it("кладе всі варіанти в один ряд", () => {
    const kb = buildSurveyKeyboard(WEEKLY_PULSE_SURVEY);
    expect(kb.inline_keyboard).toHaveLength(1);
    expect(kb.inline_keyboard[0]).toHaveLength(
      WEEKLY_PULSE_SURVEY.options.length,
    );
    expect(kb.inline_keyboard[0]?.[3]).toEqual({
      text: "4",
      callback_data: "s:week1:4",
    });
  });

  it("callback_data кожного оголошеного опитування влазить у 64 байти", () => {
    // Telegram мовчки відкидає кнопку, що не влізла: у проді це виглядає як
    // «опитування без кнопок», і причина не видна ні з логів, ні з відповіді.
    for (const survey of Object.values(SURVEYS)) {
      for (const option of survey.options) {
        const data = encodeSurveyCallback(survey.id, option.value);
        expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(
          CALLBACK_DATA_MAX_BYTES,
        );
      }
    }
  });
});

describe("resolveUpdateOrigin", () => {
  it("бере чат із повідомлення", () => {
    expect(
      resolveUpdateOrigin({
        message: { chat: { id: 5, type: "private" }, from: { is_bot: false } },
      }),
    ).toEqual({ chatId: 5, chatType: "private", fromBot: false });
  });

  it("бере чат із повідомлення, до якого причеплена кнопка", () => {
    // Найдорожча помилка цього роутера: читати `update.message.chat.id` для
    // обох випадків. Тоді всі натискання мовчки ігноруються, і збоку це
    // виглядає як «кнопки не працюють».
    expect(
      resolveUpdateOrigin({
        callback_query: {
          id: "q",
          from: { is_bot: false },
          message: { message_id: 1, chat: { id: 5, type: "private" } },
          data: "s:week1:1",
        },
      }),
    ).toEqual({ chatId: 5, chatType: "private", fromBot: false });
  });

  it("порожній апдейт не видає себе за приватний чат", () => {
    expect(resolveUpdateOrigin({})).toEqual({
      chatId: null,
      chatType: null,
      fromBot: false,
    });
  });
});

describe("isValidWebhookSecret", () => {
  it("приймає точний збіг", () => {
    expect(isValidWebhookSecret("s3cret", "s3cret")).toBe(true);
  });

  it("відхиляє розбіжність, іншу довжину і відсутній заголовок", () => {
    expect(isValidWebhookSecret("nope", "s3cret")).toBe(false);
    expect(isValidWebhookSecret("s3cre", "s3cret")).toBe(false);
    expect(isValidWebhookSecret(undefined, "s3cret")).toBe(false);
  });

  it("відхиляє все, якщо секрет не налаштований", () => {
    // Інакше порожній конфіг зробив би ендпоінт відкритим для будь-кого,
    // хто вгадає порожній заголовок.
    expect(isValidWebhookSecret("", "")).toBe(false);
    expect(isValidWebhookSecret(undefined, "")).toBe(false);
  });
});

/**
 * `recordStart` робить ДВА запити: upsert і підрахунок позиції. Мок віддає їх
 * по черзі, щоб тест ловив зміну кількості запитів, а не мовчки її ковтав.
 */
function fakePool(
  rows: unknown[] = [{ created: true, id: "1" }],
  position = "1",
) {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows, rowCount: rows.length })
    .mockResolvedValue({ rows: [{ position }], rowCount: 1 });
  return { pool: { query } as never, query };
}

describe("recordStart", () => {
  it("не дає повторному /start зсунути created_at чи notified_at", async () => {
    const { pool, query } = fakePool();
    await recordStart(pool, {
      chatId: 42,
      username: "u",
      firstName: "F",
      languageCode: "uk",
      startPayload: "hero",
    });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("ON CONFLICT (chat_id) DO UPDATE");
    // Ці дві колонки в SET не згадуються — саме тому ретрай Telegram
    // безпечний, а вже запрошена людина не повертається в чергу розсилки.
    expect(sql).not.toMatch(/SET[\s\S]*created_at\s*=/);
    expect(sql).not.toMatch(/SET[\s\S]*notified_at\s*=/);
    // Відписка знімається: явний /start — це згода.
    expect(sql).toMatch(/opted_out_at\s*=\s*NULL/);
    // Перший канал атрибуції не перетирається наступним /start.
    expect(sql).toContain("COALESCE(telegram_waitlist.start_payload");
  });

  it("повернення через /start скасовує очікування причини виходу", async () => {
    const { pool, query } = fakePool();
    await recordStart(pool, {
      chatId: 42,
      username: null,
      firstName: null,
      languageCode: null,
      startPayload: null,
    });

    // Без цього рядка перше ж повідомлення того, хто передумав і повернувся,
    // осіло б у stop_reason як «причина, чому пішов».
    expect(String(query.mock.calls[0]?.[0])).toMatch(
      /stop_reason_awaited_at\s*=\s*NULL/,
    );
  });

  it("розрізняє вставку й оновлення через xmax", async () => {
    const { pool } = fakePool([{ created: false, id: "7" }], "7");
    await expect(
      recordStart(pool, {
        chatId: 1,
        username: null,
        firstName: null,
        languageCode: null,
        startPayload: null,
      }),
    ).resolves.toEqual({ created: false, position: 7 });
  });

  it("коерсить позицію з bigint-рядка (Hard Rule #1)", async () => {
    // Без коерції `position > TELEGRAM_BETA_WAVE_SIZE` порівняло б рядок із
    // числом: "40" > 35 у JS дає true випадково, а "9" > 35 — false.
    const { pool } = fakePool([{ created: true, id: "40" }], "40");
    const r = await recordStart(pool, {
      chatId: 2,
      username: null,
      firstName: null,
      languageCode: null,
      startPayload: null,
    });
    expect(r.position).toBe(40);
    expect(r.position + 1).toBe(41);
  });

  it("рахує позицію від власного id, а не від живих підписників", async () => {
    const { pool, query } = fakePool([{ created: true, id: "36" }], "36");
    await recordStart(pool, {
      chatId: 3,
      username: null,
      firstName: null,
      languageCode: null,
      startPayload: null,
    });

    const sql = String(query.mock.calls[1]?.[0]);
    expect(sql).toContain("count(*)");
    expect(sql).toContain("id <= $1");
    // opted_out_at свідомо НЕ фільтрується: інакше номер стрибав би вниз
    // щоразу, коли хтось попереду відписався, і читався б як помилка.
    expect(sql).not.toContain("opted_out_at");
    expect(query.mock.calls[1]?.[1]).toEqual(["36"]);
  });
});

describe("startReplyQueued", () => {
  it("називає номер і не каже «не встиг»", () => {
    const out = startReplyQueued(41);
    expect(out).toContain("41-й у черзі");
    // Відмова відсіює людину назавжди, а черга нам потрібна для добору.
    expect(out).not.toMatch(/не встиг/i);
    expect(out).toContain("/stop");
  });
});

describe("recordStop", () => {
  it("позначає відписку, а не видаляє рядок", async () => {
    const { pool, query } = fakePool([]);
    await recordStop(pool, 7);
    const sql = String(query.mock.calls[0]?.[0]);
    // DELETE зробив би людину, яка відписалась, «новим» контактом при
    // наступному /start — і вона отримала б інвайт попри своє рішення.
    expect(sql).not.toContain("DELETE");
    expect(query.mock.calls[0]?.[1]).toEqual([7]);
  });

  it("тримає ПЕРШУ дату відписки, але щоразу готовий почути причину", async () => {
    const { pool, query } = fakePool([]);
    await recordStop(pool, 7);
    const sql = String(query.mock.calls[0]?.[0]);
    // COALESCE: повторний /stop не вдає, ніби людина щойно передумала.
    expect(sql).toMatch(
      /opted_out_at\s*=\s*COALESCE\(opted_out_at,\s*NOW\(\)\)/,
    );
    // А от питання ставиться заново — і відповідь на нього приймається.
    expect(sql).toMatch(/stop_reason_awaited_at\s*=\s*NOW\(\)/);
  });
});

describe("recordStopReason", () => {
  /** Тут важливий саме `rowCount`: він і є відповіддю «чекали ми чи ні». */
  function poolWithRowCount(rowCount: number) {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount });
    return { pool: { query } as never, query };
  }

  it("записує причину одним запитом — без читання стану окремо", async () => {
    const { pool, query } = poolWithRowCount(1);
    await expect(recordStopReason(pool, 7, "  дорого  ")).resolves.toBe(true);

    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0]?.[0]);
    // Пара «прочитати стан → записати» лишила б вікно, у якому два
    // повідомлення поспіль обидва пройшли б перевірку, і друге перетерло б
    // перше. Умова живе всередині UPDATE саме тому.
    expect(sql).toContain("stop_reason_awaited_at IS NOT NULL");
    expect(sql).toMatch(/stop_reason_awaited_at\s*=\s*NULL/);
    // Текст обрізається по краях, а не зберігається з пробілами.
    expect(query.mock.calls[0]?.[1]).toEqual([7, "дорого"]);
  });

  it("не приймає причину поза вікном очікування", async () => {
    const { pool, query } = poolWithRowCount(1);
    await recordStopReason(pool, 7, "щось");
    // Без вікна випадкове повідомлення через два тижні після /stop осіло б
    // як «причина виходу» і спотворило б єдину якісну метрику відвалу.
    expect(String(query.mock.calls[0]?.[0])).toContain("INTERVAL '1 day'");
  });

  it("не чекали причину → false і жодного запису", async () => {
    const { pool } = poolWithRowCount(0);
    await expect(recordStopReason(pool, 7, "привіт")).resolves.toBe(false);
  });

  it("порожній текст не доходить до бази", async () => {
    const { pool, query } = poolWithRowCount(1);
    await expect(recordStopReason(pool, 7, "   \n ")).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("обрізає простирадло до межі колонки", async () => {
    const { pool, query } = poolWithRowCount(1);
    await recordStopReason(pool, 7, "я".repeat(STOP_REASON_MAX_LEN + 500));
    expect(String(query.mock.calls[0]?.[1]?.[1])).toHaveLength(
      STOP_REASON_MAX_LEN,
    );
  });
});

describe("recordSurveyAnswer", () => {
  function poolWithRowCount(rowCount: number) {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount });
    return { pool: { query } as never, query };
  }

  it("зараховує першу відповідь", async () => {
    const { pool, query } = poolWithRowCount(1);
    await expect(
      recordSurveyAnswer(pool, { chatId: 7, surveyId: "week1", answer: "4" }),
    ).resolves.toEqual({ accepted: true });
    expect(query.mock.calls[0]?.[1]).toEqual([7, "week1", "4"]);
  });

  it("повторне голосування відсікає БАЗА, а не окремий SELECT", async () => {
    const { pool, query } = poolWithRowCount(0);
    await expect(
      recordSurveyAnswer(pool, { chatId: 7, surveyId: "week1", answer: "1" }),
    ).resolves.toEqual({ accepted: false });

    // Telegram ретраїть callback-апдейт, поки не побачить 200, тож два
    // однакові апдейти в польоті — штатний режим. Перевірка «чи вже
    // голосував» окремим запитом мала б вікно гонки рівно тут.
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("ON CONFLICT (chat_id, survey_id) DO NOTHING");
    expect(sql).toContain("RETURNING id");
  });
});

describe("countWaitlistStats", () => {
  it("коерсить bigint-рядки з pg у числа (Hard Rule #1)", async () => {
    const query = vi
      .fn()
      // `count(*)` у pg — bigint, і драйвер віддає його РЯДКОМ.
      .mockResolvedValueOnce({
        rows: [
          {
            pending: "3",
            notified: "1",
            opted_out: "2",
            total: "6",
            last_signup: new Date("2026-07-29T10:00:00Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { channel: "hero", count: "4" },
          { channel: "footer", count: "2" },
        ],
      });

    const stats = await countWaitlistStats({ query } as never);

    expect(stats.pending).toBe(3);
    expect(stats.total).toBe(6);
    expect(stats.byChannel).toEqual([
      { channel: "hero", count: 4 },
      { channel: "footer", count: 2 },
    ]);
    // Без коерції `total + 1` дало б "61" — саме це правило й ловить.
    expect(stats.total + 1).toBe(7);
  });

  it("не витягує chat_id і хендли — лише числа", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });
    await countWaitlistStats({ query } as never);

    const sql = query.mock.calls.map((c) => String(c[0])).join(" ");
    expect(sql).not.toMatch(/chat_id/);
    expect(sql).not.toMatch(/telegram_username/);
  });
});

describe("formatStatsReply", () => {
  const base = {
    pending: 0,
    notified: 0,
    optedOut: 0,
    total: 0,
    lastSignupAt: null,
    byChannel: [],
  };

  it("порожній список читається як порожній, а не як нулі", () => {
    expect(formatStatsReply(base)).toMatch(/порожній/);
  });

  it("показує розбивку за каналом і час у Києві", () => {
    const out = formatStatsReply({
      ...base,
      pending: 2,
      total: 2,
      lastSignupAt: new Date("2026-07-29T07:30:00Z"),
      byChannel: [{ channel: "hero", count: 2 }],
    });
    expect(out).toMatch(/Вейтліст: 2/);
    expect(out).toMatch(/hero — 2/);
    // 07:30 UTC = 10:30 Kyiv. Без явної зони власник читав би час назад.
    expect(out).toMatch(/10:30/);
  });
});
