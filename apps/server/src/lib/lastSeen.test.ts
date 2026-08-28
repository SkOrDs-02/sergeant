import { beforeEach, describe, expect, it, vi } from "vitest";

// Прапорець вимкнений у `vitest.config.ts` для всього unit-прогону: маршрутні
// тести мокають пул чергою `mockResolvedValueOnce`, і позаплановий UPDATE
// зʼїдає чужу відповідь. Тут вмикаємо його явно — це єдине місце, де
// перевіряється сама поведінка трекінгу.
vi.mock("../env/env.js", () => ({
  env: { LAST_SEEN_TRACKING_ENABLED: true },
}));

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("../db.js", () => ({ default: { query: queryMock } }));
vi.mock("../obs/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { __resetLastSeenThrottleForTests, touchLastSeen } from "./lastSeen.js";

/** `touchLastSeen` відкладає запит на наступний тік — чекаємо саме його. */
function flushImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("touchLastSeen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    __resetLastSeenThrottleForTests();
  });

  it("пише мітку візиту", async () => {
    touchLastSeen("u1");
    await flushImmediate();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0]?.[1]).toEqual(["u1"]);
  });

  it("не бʼє в БД частіше разу на годину для одного юзера", async () => {
    touchLastSeen("u1");
    touchLastSeen("u1");
    touchLastSeen("u1");
    await flushImmediate();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("throttle персональний, а не глобальний", async () => {
    touchLastSeen("u1");
    touchLastSeen("u2");
    await flushImmediate();
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("ставить мітку до await-у, тож паралельні запити не дублюють UPDATE", async () => {
    // Без синхронної мітки десяток одночасних запитів одного юзера проскочив
    // би перевірку разом — саме цей сценарій і породжує зайве навантаження.
    // `never`-narrowing: якщо тримати resolver у `let`, TS вважає, що його
    // ніколи не присвоюють (запис відбувається всередині executor-а). Тому
    // тримаємо у полі обʼєкта — тип лишається чесним.
    const pending: { resolve: () => void } = { resolve: () => {} };
    queryMock.mockImplementation(
      () =>
        new Promise<{ rows: []; rowCount: number }>((resolve) => {
          pending.resolve = () => resolve({ rows: [], rowCount: 1 });
        }),
    );
    touchLastSeen("u1");
    touchLastSeen("u1");
    await flushImmediate();
    expect(queryMock).toHaveBeenCalledTimes(1);
    pending.resolve();
  });

  it("збій запису знімає мітку, щоб наступний запит спробував ще раз", async () => {
    queryMock.mockRejectedValueOnce(new Error("pool exhausted"));
    touchLastSeen("u1");
    await flushImmediate();
    // Дати `.catch` відпрацювати перед повторною спробою.
    await Promise.resolve();
    await Promise.resolve();

    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    touchLastSeen("u1");
    await flushImmediate();
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("не валить викликача, коли БД недоступна", async () => {
    queryMock.mockRejectedValue(new Error("down"));
    expect(() => touchLastSeen("u1")).not.toThrow();
    await flushImmediate();
  });
});
