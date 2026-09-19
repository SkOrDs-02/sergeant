// @vitest-environment jsdom
/**
 * Вхідні гейти воркера бази — відповідь на знахідку CodeQL «Missing origin
 * verification in postMessage handler».
 *
 * Пін тут не косметичний. Виділений воркер отримує повідомлення лише від
 * свого документа, і браузер лишає їм ПОРОЖНІЙ `origin` — тож «очевидна»
 * строга перевірка `event.origin === location.origin` відхиляла б усі
 * легітимні виклики, і застосунок мовчки лишився б без локальної бази.
 * Перший тест ловить саме таку правку.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sqlite.org/sqlite-wasm", () => ({ default: vi.fn() }));

const posted: unknown[] = [];

beforeAll(async () => {
  Object.defineProperty(globalThis, "postMessage", {
    value: (message: unknown) => posted.push(message),
    configurable: true,
  });
  await import("./sqliteWorker");
});

beforeEach(() => {
  posted.length = 0;
});

function deliver(origin: string, data: unknown): void {
  (globalThis.onmessage as ((event: unknown) => void) | null)?.({
    origin,
    data,
  });
}

async function settled(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("вхідні гейти воркера", () => {
  it("пропускає повідомлення з порожнім origin — саме такі шле браузер", async () => {
    deliver("", { id: 7, kind: "exec", sql: "SELECT 1" });
    await settled();

    // База не відкрита, тож очікувана відповідь — помилка, але саме з
    // нашим `id`: повідомлення дійшло до обробника.
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ id: 7, ok: false });
  });

  it("мовчки відкидає повідомлення з чужого origin", async () => {
    deliver("https://evil.example", { id: 8, kind: "exec", sql: "SELECT 1" });
    await settled();

    expect(posted).toHaveLength(0);
  });

  it("мовчки відкидає повідомлення невідомої форми", async () => {
    deliver("", { id: 9, kind: "drop-everything" });
    deliver("", "не обʼєкт");
    deliver("", null);
    await settled();

    // Відповідати нікому: жоден наш виклик на такі повідомлення не чекає,
    // а `id: undefined` у відповіді клієнт усе одно не зміг би віднести.
    expect(posted).toHaveLength(0);
  });
});
