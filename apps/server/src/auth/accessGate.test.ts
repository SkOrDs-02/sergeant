/**
 * Рубильник закритого доступу.
 *
 * WHY цей тест. Гейт має рівно один спосіб зламатись тихо: порожня або
 * зіпсована змінна лишає продукт відкритим, і ніхто цього не побачить, бо
 * все працює. Тому перевіряємо обидва напрямки — що порожнє значення
 * НЕ закриває, і що непорожнє закриває всім, кого немає в списку.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const env: { ACCESS_ALLOWLIST_USER_IDS?: string } = {};

vi.mock("../env/env.js", () => ({ env }));

const { isAccessAllowed, isAccessGateEnabled } =
  await import("./accessGate.js");

describe("accessGate", () => {
  beforeEach(() => {
    delete env.ACCESS_ALLOWLIST_USER_IDS;
  });

  it("порожня змінна лишає доступ відкритим", () => {
    expect(isAccessGateEnabled()).toBe(false);
    expect(isAccessAllowed("будь-хто")).toBe(true);
  });

  it("пробіли і коми без id не рахуються за список", () => {
    env.ACCESS_ALLOWLIST_USER_IDS = " , ,  ";
    expect(isAccessGateEnabled()).toBe(false);
    expect(isAccessAllowed("будь-хто")).toBe(true);
  });

  it("непорожній список пускає своїх і відсікає решту", () => {
    env.ACCESS_ALLOWLIST_USER_IDS = "founder-id, qa-bot-id";
    expect(isAccessGateEnabled()).toBe(true);
    expect(isAccessAllowed("founder-id")).toBe(true);
    expect(isAccessAllowed("qa-bot-id")).toBe(true);
    expect(isAccessAllowed("сторонній")).toBe(false);
  });

  it("id зіставляється точно, без часткових збігів", () => {
    env.ACCESS_ALLOWLIST_USER_IDS = "founder-id";
    expect(isAccessAllowed("founder-id-2")).toBe(false);
    expect(isAccessAllowed("founder")).toBe(false);
  });
});
