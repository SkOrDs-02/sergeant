import { afterEach, describe, expect, it } from "vitest";
import {
  hasDirtyState,
  registerDirtyState,
  resetDirtyStateForTests,
} from "./dirtyState";

afterEach(() => resetDirtyStateForTests());

describe("dirtyState", () => {
  it("порожній за замовчуванням", () => {
    expect(hasDirtyState()).toBe(false);
  });

  it("лічить незалежні джерела: брудний, доки знято не всі", () => {
    const a = registerDirtyState();
    const b = registerDirtyState();
    expect(hasDirtyState()).toBe(true);
    a();
    expect(hasDirtyState()).toBe(true);
    b();
    expect(hasDirtyState()).toBe(false);
  });

  it("повторне зняття ідемпотентне і не чіпає чужі реєстрації", () => {
    const a = registerDirtyState();
    const b = registerDirtyState();
    a();
    a();
    expect(hasDirtyState()).toBe(true);
    b();
    expect(hasDirtyState()).toBe(false);
  });
});
