import { describe, expect, it } from "vitest";
import {
  formatLandingStartPayload,
  newLandingRef,
  parseLandingStartPayload,
} from "./landingAttribution";

/**
 * Контракт естафети лендінг → бот (аудит телеметрії 2026-08-16). Ключова
 * властивість — round-trip: що лендінг зібрав, те вебхук мусить розібрати,
 * інакше воронка знову розпадеться на дві незведені половини.
 */

describe("newLandingRef", () => {
  it("віддає токен фіксованої довжини з дозволеного Telegram алфавіту", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(newLandingRef()).toMatch(/^[a-z0-9]{16}$/);
    }
  });

  it("не повторюється між викликами", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newLandingRef()));
    expect(seen.size).toBe(200);
  });
});

describe("formatLandingStartPayload / parseLandingStartPayload", () => {
  it.each(["hero", "footer", "beta"] as const)(
    "round-trip для %s",
    (placement) => {
      const ref = newLandingRef();
      const payload = formatLandingStartPayload(placement, ref);
      expect(parseLandingStartPayload(payload)).toEqual({ placement, ref });
    },
  );

  // Telegram ріже payload на 64 символах і мовчки псує все поза
  // `[A-Za-z0-9_-]` — якщо не влізли, атрибуція зникає без жодної помилки.
  it("тримається в межах ліміту Telegram", () => {
    const payload = formatLandingStartPayload("footer", newLandingRef());
    expect(payload.length).toBeLessThanOrEqual(64);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  // Історичні payload-и без токена лишились у базі з часів до цього
  // контракту; вони мають читатись як «каналу не знаємо», а не падати.
  it.each(["hero", "footer", "", "   ", "hero_", "hero_SHORT", "junk"])(
    "повертає null на неконтрактному payload %j",
    (payload) => {
      expect(parseLandingStartPayload(payload)).toBeNull();
    },
  );

  it.each([null, undefined])("повертає null на %j", (payload) => {
    expect(parseLandingStartPayload(payload)).toBeNull();
  });

  it("відкидає невідоме місце кнопки", () => {
    expect(parseLandingStartPayload(`sidebar_${newLandingRef()}`)).toBeNull();
  });

  it("відкидає токен із символами поза алфавітом", () => {
    expect(parseLandingStartPayload("hero_AAAAAAAAAAAAAAAA")).toBeNull();
  });
});
