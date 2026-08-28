import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Гейт `/stats` за `chat_id` — єдине, що відділяє власника від будь-кого, хто
 * знає юзернейм бота. Тест саме про це: невідповідний chat_id мусить не
 * отримати НІЧОГО — ні цифр, ні повідомлення про відмову (інакше сама відмова
 * підтверджувала б існування команди).
 *
 * Мокаємо env і Telegram-клієнт: перевіряємо роутінг і гейт, а не мережу.
 */

const ADMIN_CHAT_ID = "555000111";
const SECRET = "webhook-secret-stub";

const {
  sendMessageMock,
  editMessageTextMock,
  answerCallbackQueryMock,
  envStub,
} = vi.hoisted(() => ({
  sendMessageMock: vi.fn().mockResolvedValue({ ok: true }),
  editMessageTextMock: vi.fn().mockResolvedValue({ ok: true }),
  answerCallbackQueryMock: vi.fn().mockResolvedValue({ ok: true }),
  envStub: {
    TELEGRAM_WAITLIST_BOT_TOKEN: "token-stub",
    TELEGRAM_WAITLIST_WEBHOOK_SECRET: "webhook-secret-stub",
    TELEGRAM_WAITLIST_ADMIN_CHAT_ID: "555000111",
    // Число, не рядок: у проді zod (`coerceInt.positive().default(35)`) віддає
    // саме число, і мок мусить це дзеркалити. Якби тут лишився `undefined`,
    // `position > undefined` дало б `false` — тобто ліміт мовчки зник би,
    // і тест на 36-го проходив би як «всі в хвилі».
    TELEGRAM_BETA_WAVE_SIZE: 35,
    TELEGRAM_BETA_APP_URL: "https://beta.sergeant.app",
    TELEGRAM_BETA_INVITE_LINK: "https://t.me/+abc123",
    TELEGRAM_BETA_FOUNDER_USERNAME: "@skords",
  } as Record<string, string | number>,
}));

vi.mock("../env/env.js", () => ({ env: envStub }));
vi.mock("../modules/alerts/telegramShipper.js", () => ({
  createTelegramApiClient: () => ({
    sendMessage: sendMessageMock,
    editMessageText: editMessageTextMock,
    answerCallbackQuery: answerCallbackQueryMock,
  }),
}));
vi.mock("../http/index.js", async () => {
  const actual =
    await vi.importActual<typeof import("../http/index.js")>(
      "../http/index.js",
    );
  return {
    ...actual,
    // Лімітер робить власний INSERT у pool — тут він лише шум.
    rateLimitExpress: () => (_q: unknown, _s: unknown, next: () => void) =>
      next(),
  };
});

const { createTelegramWebhookRouter } = await import("./telegram-webhook.js");

function makeApp(queryImpl: ReturnType<typeof vi.fn>) {
  const app = express();
  app.use(express.json());
  app.use(createTelegramWebhookRouter({ pool: { query: queryImpl } as never }));
  return app;
}

function startUpdate(chatId: number) {
  return {
    message: {
      chat: { id: chatId, type: "private" },
      from: { id: chatId, is_bot: false, username: "u", first_name: "F" },
      text: "/start hero",
    },
  };
}

function statsUpdate(chatId: number) {
  return {
    message: {
      chat: { id: chatId, type: "private" },
      from: { id: chatId, is_bot: false, username: "u", first_name: "F" },
      text: "/stats",
    },
  };
}

function textUpdate(chatId: number, text: string) {
  return {
    message: {
      chat: { id: chatId, type: "private" },
      from: { id: chatId, is_bot: false, username: "u", first_name: "F" },
      text,
    },
  };
}

function callbackUpdate(chatId: number, data: string) {
  return {
    callback_query: {
      id: "cbq-77",
      from: { id: chatId, is_bot: false },
      message: { message_id: 4242, chat: { id: chatId, type: "private" } },
      data,
    },
  };
}

/** Коротка обгортка: усі тести шлють той самий POST з валідним секретом. */
function post(query: ReturnType<typeof vi.fn>, body: unknown) {
  return request(makeApp(query))
    .post("/api/telegram/webhook")
    .set("X-Telegram-Bot-Api-Secret-Token", SECRET)
    .send(body as object);
}

beforeEach(() => {
  sendMessageMock.mockClear();
  editMessageTextMock.mockClear();
  answerCallbackQueryMock.mockClear();
  envStub["TELEGRAM_WAITLIST_ADMIN_CHAT_ID"] = ADMIN_CHAT_ID;
});

describe("POST /api/telegram/webhook — гейт /stats", () => {
  it("власник отримує зведення", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            pending: "2",
            notified: "0",
            opted_out: "0",
            total: "2",
            last_signup: new Date("2026-07-29T07:30:00Z"),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ channel: "hero", count: "2" }] });

    const res = await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", SECRET)
      .send(statsUpdate(Number(ADMIN_CHAT_ID)));

    expect(res.status).toBe(200);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(String(sendMessageMock.mock.calls[0]?.[0]?.text)).toMatch(
      /Вейтліст: 2/,
    );
  });

  it("чужий chat_id не отримує ні цифр, ні відмови", async () => {
    const query = vi.fn();
    const res = await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", SECRET)
      .send(statsUpdate(999999999));

    // 200 для Telegram — щоб він не ретраїв. Але жодної відповіді людині
    // і жодного запиту в базу: команда для неї просто не існує.
    expect(res.status).toBe(200);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("порожній ADMIN_CHAT_ID робить команду інертною навіть для власника", async () => {
    envStub["TELEGRAM_WAITLIST_ADMIN_CHAT_ID"] = "";
    const query = vi.fn();
    await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", SECRET)
      .send(statsUpdate(Number(ADMIN_CHAT_ID)));

    // Fail-closed: незаданий конфіг не має відкривати статистику всім,
    // у кого chat_id випадково збігся з порожнім рядком.
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("36-й отримує номер у черзі, а не «ти в списку»", async () => {
    // Ліміт хвилі — 35 (TELEGRAM_BETA_WAVE_SIZE, дефолт). Мок віддає upsert,
    // потім позицію 36.
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ created: true, id: "36" }] })
      .mockResolvedValueOnce({ rows: [{ position: "36" }] });

    await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", SECRET)
      .send(startUpdate(777000111));

    const text = String(sendMessageMock.mock.calls[0]?.[0]?.text);
    expect(text).toContain("36-й у черзі");
    expect(text).not.toContain("Готово");
  });

  it("35-й ще потрапляє в хвилю", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ created: true, id: "35" }] })
      .mockResolvedValueOnce({ rows: [{ position: "35" }] });

    await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", SECRET)
      .send(startUpdate(777000222));

    const text = String(sendMessageMock.mock.calls[0]?.[0]?.text);
    expect(text).toContain("Готово");
    expect(text).not.toContain("черзі");
  });

  it("невірний секрет → 401 і жодного запиту в базу", async () => {
    const query = vi.fn();
    const res = await request(makeApp(query))
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", "wrong")
      .send(statsUpdate(Number(ADMIN_CHAT_ID)));

    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("POST /api/telegram/webhook — довідкові команди", () => {
  it("/app і /install відповідають без жодного походу в базу", async () => {
    const query = vi.fn();

    await post(query, textUpdate(777001, "/app"));
    expect(String(sendMessageMock.mock.calls[0]?.[0]?.text)).toContain(
      "https://beta.sergeant.app",
    );

    await post(query, textUpdate(777001, "/install"));
    const install = String(sendMessageMock.mock.calls[1]?.[0]?.text);
    expect(install).toContain("Safari");
    expect(install).toMatch(/лише у встановленому застосунку/i);

    // Довідка — це статичні тексти; звертатись по них у Postgres нема за чим.
    expect(query).not.toHaveBeenCalled();
  });

  it("/help віддає єдиний канал — групу бети", async () => {
    const query = vi.fn();
    await post(query, textUpdate(777002, "/help"));

    const text = String(sendMessageMock.mock.calls[0]?.[0]?.text);
    expect(text).toContain("https://t.me/+abc123");
    // Контакт founder-а в оточенні заданий і живе в `/install` — але в
    // довідці маршрут рівно один, і роутер не має права підмішати інший.
    expect(text).not.toContain("@skords");
  });
});

describe("POST /api/telegram/webhook — причина відписки", () => {
  it("/stop підтверджує відписку і питає чому", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    await post(query, textUpdate(777003, "/stop"));

    const text = String(sendMessageMock.mock.calls[0]?.[0]?.text);
    expect(text).toContain("Прибрав");
    expect(text).toMatch(/чому/i);
  });

  it("наступний текст зараховується як причина й отримує підтвердження", async () => {
    // rowCount=1 — база каже «так, ми чекали на причину саме від цього чату».
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    await post(query, textUpdate(777003, "дорого і не вистачає часу"));

    expect(query).toHaveBeenCalledTimes(1);
    expect(String(sendMessageMock.mock.calls[0]?.[0]?.text)).toContain("Почув");
  });

  it("текст поза очікуванням причини лишається без відповіді", async () => {
    // rowCount=0 — ми нічого не чекали. Бот не співрозмовник: відповідь на
    // випадкове «привіт» перетворила б розсилку на чат.
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await post(query, textUpdate(777004, "привіт"));

    expect(res.status).toBe(200);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/telegram/webhook — опитування", () => {
  it("зараховує відповідь, гасить годинник на кнопці й переписує повідомлення", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ id: "1" }], rowCount: 1 });
    const res = await post(query, callbackUpdate(777005, "s:week1:4"));

    expect(res.status).toBe(200);
    expect(query.mock.calls[0]?.[1]).toEqual([777005, "week1", "4"]);

    // Без answerCallbackQuery клієнт крутить годинник близько 30 секунд —
    // людина встигає натиснути ще раз, вирішивши, що не спрацювало.
    expect(answerCallbackQueryMock).toHaveBeenCalledTimes(1);
    expect(answerCallbackQueryMock.mock.calls[0]?.[0]?.callbackQueryId).toBe(
      "cbq-77",
    );

    const edit = editMessageTextMock.mock.calls[0]?.[0];
    expect(edit?.messageId).toBe(4242);
    expect(String(edit?.text)).toContain("Твоя відповідь: 4");
    // Відповідь редагує наявне повідомлення, а не додає нове в стрічку.
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("повторне натискання не переписує повідомлення, але дає спливашку", async () => {
    // rowCount=0 — ON CONFLICT DO NOTHING відсік дубль.
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await post(query, callbackUpdate(777005, "s:week1:2"));

    expect(answerCallbackQueryMock).toHaveBeenCalledTimes(1);
    expect(String(answerCallbackQueryMock.mock.calls[0]?.[0]?.text)).toMatch(
      /уже зарахована/i,
    );
    // Telegram усе одно відкинув би edit тим самим текстом
    // (`message is not modified`) — не робимо зайвого виклику.
    expect(editMessageTextMock).not.toHaveBeenCalled();
  });

  it("збій запису голосу → 500, щоб Telegram повторив апдейт", async () => {
    const query = vi.fn().mockRejectedValue(new Error("db down"));
    const res = await post(query, callbackUpdate(777005, "s:week1:1"));

    expect(res.status).toBe(500);
    // Квитанцію не шлемо: інакше кнопка згасне, і людина вирішить, що голос
    // зараховано, хоч ретрай Telegram ще попереду.
    expect(answerCallbackQueryMock).not.toHaveBeenCalled();
  });

  it("кнопка невідомого опитування ігнорується мовчки", async () => {
    const query = vi.fn();
    const res = await post(query, callbackUpdate(777005, "s:week99:4"));

    expect(res.status).toBe(200);
    expect(query).not.toHaveBeenCalled();
    expect(answerCallbackQueryMock).not.toHaveBeenCalled();
  });
});

/**
 * Груповий чат: довідка працює, підписка — ні.
 *
 * Раніше апдейт із групи відсікався суцільним `chatType !== "private"` ще
 * до парсингу команди, тож бот мовчав на все. Помітили, коли його додали в
 * чат і він не відповів навіть на `/help`.
 *
 * Межа проведена не за обережністю, а за моделлю даних: `chat_id` — ключ
 * підписника, і в групі він належить ГРУПІ. Тому нижче пінимо обидва боки:
 * довідка відповідає, а все, що пише в `subscriptions`/`waitlist` або
 * звіряється з ід власника, лишається німим і не торкається БД.
 */
describe("telegram webhook — груповий чат", () => {
  function groupUpdate(groupChatId: number, text: string) {
    return {
      message: {
        // Ід групи відʼємний — саме так їх шле Telegram. Беремо справжню
        // форму, бо гейт `/stats` порівнює `chat_id` рядком, і додатне
        // число тут випадково зробило б тест поблажливішим.
        chat: { id: groupChatId, type: "supergroup" },
        from: { id: 999111, is_bot: false, username: "u", first_name: "F" },
        text,
      },
    };
  }

  const GROUP_ID = -1002233445566;

  it.each(["/help", "/app", "/install"])(
    "%s відповідає у групі й не чіпає БД",
    async (cmd) => {
      const query = vi.fn();
      const res = await post(query, groupUpdate(GROUP_ID, cmd));

      expect(res.status).toBe(200);
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      expect(String(sendMessageMock.mock.calls[0]?.[0]?.chatId)).toBe(
        String(GROUP_ID),
      );
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("довідка в групі попереджає, що підписка — в особистих", async () => {
    const query = vi.fn();
    await post(query, groupUpdate(GROUP_ID, "/help"));

    // Довідка перелічує /stop, а він у групі мовчить. Без цього рядка
    // текст запрошував би до команди, яка тут нічого не робить — тобто
    // відтворював би ту саму тишу, через яку бота й пішли перевіряти.
    const text = String(sendMessageMock.mock.calls[0]?.[0]?.text);
    expect(text).toMatch(/в особистих/i);
  });

  it("та сама довідка в приватному чаті цього рядка НЕ має", async () => {
    const query = vi.fn();
    await post(query, textUpdate(777042, "/help"));

    const text = String(sendMessageMock.mock.calls[0]?.[0]?.text);
    expect(text).not.toMatch(/в особистих/i);
  });

  it("суфікс /help@bot у групі теж працює", async () => {
    const query = vi.fn();
    const res = await post(query, groupUpdate(GROUP_ID, "/help@sergeant_bot"));

    expect(res.status).toBe(200);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it("/start у групі мовчить і НЕ заводить підписника", async () => {
    const query = vi.fn();
    const res = await post(query, groupUpdate(GROUP_ID, "/start hero"));

    expect(res.status).toBe(200);
    expect(sendMessageMock).not.toHaveBeenCalled();
    // Найважливіше в цьому тесті. Підписником стала б сама група, і
    // розсилка полетіла б у чат, який ніхто на неї не підписував.
    expect(query).not.toHaveBeenCalled();
  });

  it("/stop у групі мовчить і НЕ відписує", async () => {
    const query = vi.fn();
    const res = await post(query, groupUpdate(GROUP_ID, "/stop"));

    expect(res.status).toBe(200);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("звичайний текст у групі не записується як причина відписки", async () => {
    const query = vi.fn();
    const res = await post(query, groupUpdate(GROUP_ID, "просто балачка"));

    expect(res.status).toBe(200);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("/stats у групі мовчить навіть коли ід групи збігається з ADMIN_CHAT_ID", async () => {
    // Патологічний, але дешевий випадок: якби гейт групи стояв ПІСЛЯ
    // перевірки власника, статистику вейтліста можна було б витягти в
    // спільний чат. Порядок перевірок тут і пінимо.
    envStub["TELEGRAM_WAITLIST_ADMIN_CHAT_ID"] = String(GROUP_ID);
    const query = vi.fn();
    const res = await post(query, groupUpdate(GROUP_ID, "/stats"));

    expect(res.status).toBe(200);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
