import { describe, expect, it } from "vitest";

import { classifyTickError, isTransportError } from "./tickErrorReport";

const SCOPE = "sync-v2-push-tick";

describe("isTransportError", () => {
  // Формулювання рушіїв, зняті з реальних прод-подій, а не вигадані:
  // `Load failed` — Safari (SERGEANT-API-C / WEB-G, iOS 18.7),
  // `Failed to fetch` — Chrome/Firefox.
  it.each([
    "Load failed",
    "TypeError: Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "The network connection was lost.",
    "Network request failed",
    "The request timed out.",
  ])("розпізнає транспортний збій: %s", (message) => {
    expect(isTransportError(new Error(message))).toBe(true);
  });

  it("не чіпає прикладні помилки", () => {
    expect(isTransportError(new Error("outbox row is malformed"))).toBe(false);
    expect(isTransportError(new Error("SQLITE_CORRUPT"))).toBe(false);
    expect(isTransportError(null)).toBe(false);
    expect(isTransportError(undefined)).toBe(false);
    expect(isTransportError({})).toBe(false);
  });
});

describe("classifyTickError", () => {
  it("глушить транспортний збій, коли браузер каже, що мережі немає", () => {
    const verdict = classifyTickError(new Error("Load failed"), SCOPE, false);
    expect(verdict.report).toBe(false);
    expect(verdict.context).toEqual({});
  });

  // Ключова межа. Wi-Fi без інтернету віддає той самий текст, що й
  // розбитий деплой (провальний динамічний імпорт у Safari — теж
  // `Load failed`). Глушити цей випадок означало б сховати регресію
  // стейл-асетів — ту саму родину, що дала баг із wasm.
  it("НЕ глушить транспортний збій, поки браузер вважає, що мережа є", () => {
    const verdict = classifyTickError(new Error("Load failed"), SCOPE, true);
    expect(verdict.report).toBe(true);
    expect(verdict.context).toMatchObject({
      scope: SCOPE,
      transport: true,
      online: true,
      errorName: "Error",
    });
  });

  it("НЕ глушить, коли стан мережі невідомий", () => {
    const verdict = classifyTickError(
      new Error("Load failed"),
      SCOPE,
      undefined,
    );
    expect(verdict.report).toBe(true);
    expect(verdict.context).toMatchObject({ online: "unknown" });
  });

  it("прикладну помилку репортить навіть офлайн — офлайн не привід губити баг", () => {
    const verdict = classifyTickError(
      new Error("outbox row is malformed"),
      SCOPE,
      false,
    );
    expect(verdict.report).toBe(true);
    expect(verdict.context).toMatchObject({ transport: false, online: false });
  });

  it("позначає ім'я помилки — саме воно розділяє TypeError від решти", () => {
    const verdict = classifyTickError(
      new TypeError("Load failed"),
      SCOPE,
      true,
    );
    expect(verdict.context).toMatchObject({ errorName: "TypeError" });
  });
});
