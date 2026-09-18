/**
 * B41 — глобальний таймаут не має рубати SSE.
 *
 * `requestTimeout()` викликав `req.destroy()` БЕЗУМОВНО. Для стріму, чиї
 * заголовки пішли в першу секунду, це означало обрив живого зʼєднання на
 * 120-й секунді, тоді як worst-case чат (до 8 tool-ітерацій по 60 с) цю
 * стелю перевищує законно.
 *
 * Не боліло лише тому, що клієнт абортить сам на 90 с — симптом маскувався
 * чужим таймером. Ці тести пінять саме поведінку сервера, щоб зміна на
 * клієнті не проявила обриви заднім числом.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requestTimeout } from "./timeout.js";

type FakeRes = Response & { destroyed: boolean };

function makeReqRes(contentType: string | null) {
  const req = {
    method: "POST",
    path: "/api/chat",
    id: "req-1",
    destroy: vi.fn(),
  } as unknown as Request & { destroy: ReturnType<typeof vi.fn> };

  const handlers: Record<string, Array<() => void>> = {};
  const res = {
    headersSent: true,
    statusCode: 0,
    getHeader: (name: string) =>
      name.toLowerCase() === "content-type" ? contentType : undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json: vi.fn(() => res),
    // Мідлварь обгортає всі три, щоб не віддати другу відповідь після
    // таймауту, тож фейк мусить мати кожен — інакше падає на `.bind`.
    send: vi.fn(() => res),
    end: vi.fn(() => res),
    on(event: string, cb: () => void) {
      (handlers[event] ??= []).push(cb);
      return res;
    },
  } as unknown as FakeRes & { json: ReturnType<typeof vi.fn> };

  // Мідлварь ПІДМІНЯЄ `res.json` власною обгорткою, тож після її виклику
  // `res.json` — уже не цей спай. Тримаємо посилання окремо, інакше
  // `expect(res.json)` падає з «is not a spy».
  const jsonSpy = res.json;

  return { req, res, jsonSpy };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("requestTimeout — SSE-виняток", () => {
  it("НЕ рубає відповідь із Content-Type: text/event-stream", () => {
    const { req, res, jsonSpy } = makeReqRes("text/event-stream");
    requestTimeout(1000)(req, res, (() => {}) as NextFunction);

    vi.advanceTimersByTime(1500);

    expect(req.destroy).not.toHaveBeenCalled();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("рубає звичайну JSON-відповідь, як і раніше", () => {
    // Регрес у зворотний бік: виняток має стосуватись ТІЛЬКИ стріму,
    // інакше зомбі-запити перестануть прибиратись узагалі.
    const { req, res } = makeReqRes("application/json");
    (res as { headersSent: boolean }).headersSent = false;
    requestTimeout(1000)(req, res, (() => {}) as NextFunction);

    vi.advanceTimersByTime(1500);

    expect(req.destroy).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(408);
  });

  it("рубає запит без Content-Type (заголовок ще не виставлено)", () => {
    const { req, res } = makeReqRes(null);
    (res as { headersSent: boolean }).headersSent = false;
    requestTimeout(1000)(req, res, (() => {}) as NextFunction);

    vi.advanceTimersByTime(1500);

    expect(req.destroy).toHaveBeenCalledTimes(1);
  });

  it("після спрацювання таймера SSE-відповідь ЩЕ МОЖЕ закритись через res.end()", () => {
    // Регрес ревʼю CodeRabbit 2026-08-26. Перша версія винятку ставила
    // `timedOut = true` на початку таймера й лише потім робила ранній
    // return для стріму. Обгортки `res.json/send/end` глушаться саме цим
    // прапорцем, тож стрім опинявся в стані «писати можна, закрити не
    // можна»: `res.write()` не обгорнутий і працював, а `res.end()` ставав
    // no-op — клієнт висів до власного розриву. Тобто виняток рятував
    // зʼєднання від обриву й одразу позбавляв його здатності завершитись.
    const { req, res } = makeReqRes("text/event-stream");
    const endSpy = res.end as unknown as ReturnType<typeof vi.fn>;
    requestTimeout(1000)(req, res, (() => {}) as NextFunction);

    vi.advanceTimersByTime(1500);
    (res as unknown as { end: () => void }).end();

    expect(req.destroy).not.toHaveBeenCalled();
    expect(endSpy).toHaveBeenCalledTimes(1);
  });

  it("для НЕ-SSE пізні записи після таймауту глушаться, як і раніше", () => {
    // Зворотний бік того самого прапорця: для звичайних відповідей
    // подвійна відправка після 408 має лишатись заглушеною.
    const { req, res } = makeReqRes("application/json");
    (res as { headersSent: boolean }).headersSent = false;
    const endSpy = res.end as unknown as ReturnType<typeof vi.fn>;
    requestTimeout(1000)(req, res, (() => {}) as NextFunction);

    vi.advanceTimersByTime(1500);
    (res as unknown as { end: () => void }).end();

    expect(req.destroy).toHaveBeenCalledTimes(1);
    expect(endSpy).not.toHaveBeenCalled();
  });

  it("матч по підрядку: `text/event-stream; charset=utf-8` теж виняток", () => {
    const { req, res } = makeReqRes("text/event-stream; charset=utf-8");
    requestTimeout(1000)(req, res, (() => {}) as NextFunction);

    vi.advanceTimersByTime(1500);

    expect(req.destroy).not.toHaveBeenCalled();
  });
});
