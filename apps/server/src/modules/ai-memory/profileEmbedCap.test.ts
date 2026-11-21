import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { env } from "../../env.js";
import {
  __resetProfileEmbedCapState,
  grantProfileEmbeds,
  settleProfileEmbeds,
} from "./profileEmbedCap.js";

const savedCap = env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP;

beforeEach(() => {
  __resetProfileEmbedCapState();
});

afterEach(() => {
  env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = savedCap;
});

describe("grantProfileEmbeds (rel-34)", () => {
  it("дефолтна стеля — 50 на користувача за добу", () => {
    expect(savedCap).toBe(50);
  });

  it("видає частково, коли запит більший за залишок, і далі нічого", () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 3;
    const now = new Date("2026-11-21T10:00:00Z");
    expect(grantProfileEmbeds("u", ["a", "b"], now)).toEqual([true, true]);
    expect(grantProfileEmbeds("u", ["c", "d"], now)).toEqual([true, false]);
    expect(grantProfileEmbeds("u", ["e"], now)).toEqual([false]);
  });

  it("нова UTC-доба обнуляє лічильник", () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 1;
    const late = new Date("2026-11-21T23:59:59Z");
    expect(grantProfileEmbeds("u", ["a"], late)).toEqual([true]);
    expect(grantProfileEmbeds("u", ["b"], late)).toEqual([false]);
    expect(
      grantProfileEmbeds("u", ["b"], new Date("2026-11-22T00:00:00Z")),
    ).toEqual([true]);
  });

  it("порожній запит нічого не списує", () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 1;
    expect(grantProfileEmbeds("u", [])).toEqual([]);
    expect(grantProfileEmbeds("u", ["a"])).toEqual([true]);
  });

  it("rel-34-r2: ключ, списаний і ще не записаний, повторно не списується", () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 2;
    expect(grantProfileEmbeds("u", ["a", "b"])).toEqual([true, true]);
    // Друге дзеркалення до того, як черга записала факти: ті самі ключі
    // проходять без списання, а новий упирається в стелю.
    expect(grantProfileEmbeds("u", ["a", "b", "c"])).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("rel-34-r2: після settle той самий ключ знову списується", () => {
    env.AI_MEMORY_PROFILE_EMBED_DAILY_CAP = 2;
    expect(grantProfileEmbeds("u", ["a"])).toEqual([true]);
    settleProfileEmbeds("u", ["a"]);
    expect(grantProfileEmbeds("u", ["a"])).toEqual([true]);
    settleProfileEmbeds("u", ["a"]);
    expect(grantProfileEmbeds("u", ["a"])).toEqual([false]);
  });
});
