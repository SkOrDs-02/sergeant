/**
 * Last validated: 2026-11-18
 * Status: Active
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureSeedFoods = vi.fn<() => Promise<boolean>>();
vi.mock("./foodDb", () => ({ ensureSeedFoods: () => ensureSeedFoods() }));

import {
  ensureSeedFoodsOnce,
  resetSeedFoodsOnceForTests,
} from "./seedFoodsOnce";

beforeEach(() => {
  ensureSeedFoods.mockReset();
  resetSeedFoodsOnceForTests();
});

describe("ensureSeedFoodsOnce", () => {
  it("засіває один раз на сесію, паралельні виклики чекають той самий прогін", async () => {
    ensureSeedFoods.mockResolvedValue(true);
    const [a, b] = await Promise.all([
      ensureSeedFoodsOnce(),
      ensureSeedFoodsOnce(),
    ]);
    await ensureSeedFoodsOnce();
    expect([a, b]).toEqual([true, true]);
    expect(ensureSeedFoods).toHaveBeenCalledTimes(1);
  });

  it("невдалий засів не кешується: наступний виклик пробує знову", async () => {
    ensureSeedFoods.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await ensureSeedFoodsOnce()).toBe(false);
    expect(await ensureSeedFoodsOnce()).toBe(true);
    expect(ensureSeedFoods).toHaveBeenCalledTimes(2);
  });

  it("виняток засіву не валить пошук і не кешується", async () => {
    ensureSeedFoods
      .mockRejectedValueOnce(new Error("idb"))
      .mockResolvedValueOnce(true);
    expect(await ensureSeedFoodsOnce()).toBe(false);
    expect(await ensureSeedFoodsOnce()).toBe(true);
  });
});
