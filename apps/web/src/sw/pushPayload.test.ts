import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { normalizePushPayload, safeNotificationPath } from "./pushPayload";

const FALLBACK = "push_fallback";

describe("normalizePushPayload — канонічна вкладена форма", () => {
  // Регресія, через яку кожен серверний пуш приходив без tag і без модуля:
  // `sendToUser` кладе їх у `data`, а SW читав лише верхній рівень.
  const fromServer = {
    title: "−250,00 ₴",
    body: "Сільпо · доступно 4 210,00 ₴",
    tag: "mono_tx_42",
    data: { module: "finyk", url: "/?module=finyk" },
  };

  it("читає module з data", () => {
    expect(normalizePushPayload(fromServer, FALLBACK).module).toBe("finyk");
  });

  it("читає deep-link з data.url", () => {
    expect(normalizePushPayload(fromServer, FALLBACK).url).toBe(
      "/?module=finyk",
    );
  });

  it("зберігає tag, щоб повторна доставка заміщувала банер", () => {
    expect(normalizePushPayload(fromServer, FALLBACK).tag).toBe("mono_tx_42");
  });
});

describe("normalizePushPayload — плоска форма /api/push/send", () => {
  it("лишається робочою як fallback", () => {
    const flat = { title: "Тест", module: "routine", tag: "t1" };
    const push = normalizePushPayload(flat, FALLBACK);
    expect(push.module).toBe("routine");
    expect(push.tag).toBe("t1");
  });

  it("вкладений module виграє у плоского", () => {
    const push = normalizePushPayload(
      { title: "x", module: "routine", data: { module: "finyk" } },
      FALLBACK,
    );
    expect(push.module).toBe("finyk");
  });
});

describe("normalizePushPayload — захист", () => {
  it("підставляє fallback-tag, коли відправник його не задав", () => {
    expect(normalizePushPayload({ title: "x" }, FALLBACK).tag).toBe(FALLBACK);
  });

  it("відкидає модуль поза allow-list-ом", () => {
    expect(
      normalizePushPayload({ title: "x", data: { module: "evil" } }, FALLBACK)
        .module,
    ).toBeNull();
  });

  it("вирізає BiDi-overrides із заголовка", () => {
    const push = normalizePushPayload({ title: "safe\u202Eevil" }, FALLBACK);
    expect(push.title).toBe("safeevil");
  });

  it("обрізає надто довгий заголовок", () => {
    const push = normalizePushPayload({ title: "я".repeat(200) }, FALLBACK);
    expect(push.title).toHaveLength(80);
  });

  it("має нейтральний заголовок, коли його не прислали", () => {
    expect(normalizePushPayload({}, FALLBACK).title).toBe("Мій простір");
  });
});

describe("safeNotificationPath", () => {
  it("пропускає same-origin шлях", () => {
    expect(safeNotificationPath("/finyk/budgets")).toBe("/finyk/budgets");
  });

  it.each([
    ["https://evil.example", "абсолютний URL на чужий origin"],
    ["//evil.example", "protocol-relative URL"],
    ["javascript:alert(1)", "javascript-схема"],
    ["finyk", "відносний шлях без слеша"],
    // sec-28: WHATWG URL трактує `\` як `/` і вирізає \t/\n/\r, тож ці
    // рядки проходили префіксну перевірку й відкривали чужий origin.
    ["/\\evil.example/x", "backslash після слеша"],
    ["/\t/evil.example/", "таб між слешами"],
    ["/\n/evil.example", "перенос рядка між слешами"],
    ["/\r/evil.example", "повернення каретки між слешами"],
    // sec-28 (r2): dot-сегменти згортаються в `//host`, тож канонічний
    // pathname знову стає protocol-relative URL.
    ["/.//evil.example/x", "dot-сегмент перед подвійним слешем"],
    ["/a/..//evil.example", "parent-сегмент перед подвійним слешем"],
    ["/%2e//evil.example", "percent-encoded dot-сегмент"],
    ["/%2E%2E//evil.example", "percent-encoded parent-сегмент"],
  ])("відкидає %j (%s)", (input) => {
    expect(safeNotificationPath(input)).toBeNull();
  });

  it("зберігає query і hash same-origin шляху", () => {
    expect(safeNotificationPath("/?module=finyk#tx")).toBe("/?module=finyk#tx");
  });

  it("повертає шлях, що для будь-якого origin-у лишається на ньому ж", () => {
    const origin = "https://app.example";
    // Алфавіт навмисно кишить символами, що ламали перевірку: слеші,
    // крапки, `%2e`, `\`, керівні символи.
    const piece = fc.constantFrom(
      "/",
      "//",
      ".",
      "..",
      "%2e",
      "%2E",
      "\\",
      "\t",
      "\n",
      "\r",
      "?",
      "#",
      "@",
      ":",
      "evil.example",
      "a",
    );
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 12 }), (parts) => {
        const out = safeNotificationPath(`/${parts.join("")}`);
        if (out === null) return;
        expect(out.startsWith("/")).toBe(true);
        expect(out.startsWith("//")).toBe(false);
        expect(new URL(out, origin).origin).toBe(origin);
      }),
      { numRuns: 2000 },
    );
  });

  it("відкидає не-рядок", () => {
    expect(safeNotificationPath(undefined)).toBeNull();
    expect(safeNotificationPath(42)).toBeNull();
  });
});
