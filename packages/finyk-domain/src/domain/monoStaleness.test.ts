import { describe, expect, it } from "vitest";

import {
  evaluateMonoStaleness,
  MONO_STALENESS_THRESHOLD_DAYS,
} from "./monoStaleness.js";

const NOW = new Date("2026-07-25T12:00:00.000Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe("evaluateMonoStaleness", () => {
  it("поріг — рівно 7 днів (рішення founder-а)", () => {
    expect(MONO_STALENESS_THRESHOLD_DAYS).toBe(7);
  });

  it("мовчить, поки тиша коротша за поріг", () => {
    // Робить неможливим повернення хибних тривог на ощадливому юзері:
    // 6 днів без витрат — це ще не «дані застаріли».
    const r = evaluateMonoStaleness({
      lastEventAt: daysAgo(6),
      webhookActive: true,
      now: NOW,
    });
    expect(r).toEqual({ stale: false, days: 6 });
  });

  it("спрацьовує рівно на сьомий день, не на восьмий", () => {
    // Пін межі: `>=`, не `>`. Off-by-one тут коштує цілої доби мовчання
    // про застарілі гроші.
    expect(
      evaluateMonoStaleness({
        lastEventAt: daysAgo(7),
        webhookActive: true,
        now: NOW,
      }),
    ).toEqual({ stale: true, days: 7 });
  });

  it("рахує повні дні, а не календарні межі", () => {
    const r = evaluateMonoStaleness({
      lastEventAt: daysAgo(10),
      webhookActive: true,
      now: NOW,
    });
    expect(r).toEqual({ stale: true, days: 10 });
  });

  it("не рахує staleness для неактивного зʼєднання", () => {
    // У відключеного/невалідного зʼєднання вже є власна, точніша
    // розповідь. Розмите «дані застаріли» поверх неї — шум.
    expect(
      evaluateMonoStaleness({
        lastEventAt: daysAgo(30),
        webhookActive: false,
        now: NOW,
      }),
    ).toEqual({ stale: false, days: null });
  });

  it("мовчить, коли подій не було жодної", () => {
    // Свіжопідключений банк без жодної транзакції — не stale.
    for (const empty of [null, undefined]) {
      expect(
        evaluateMonoStaleness({
          lastEventAt: empty,
          webhookActive: true,
          now: NOW,
        }),
      ).toEqual({ stale: false, days: null });
    }
  });

  it("мовчить на непарсабельній даті замість того, щоб показати NaN", () => {
    expect(
      evaluateMonoStaleness({
        lastEventAt: "не-дата",
        webhookActive: true,
        now: NOW,
      }),
    ).toEqual({ stale: false, days: null });
  });

  it("клемпить майбутній lastEventAt у 0, а не у відʼємні дні", () => {
    // Годинник пристрою може відставати від серверного. Без клемпа UI
    // показав би «дані не оновлювались -2 дні».
    const r = evaluateMonoStaleness({
      lastEventAt: daysAgo(-2),
      webhookActive: true,
      now: NOW,
    });
    expect(r).toEqual({ stale: false, days: 0 });
  });
});
