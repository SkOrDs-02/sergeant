/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Переїзд хабового налаштування зі свого ключа у спільний мішок
 * (залишок PR-S13: автогенерація дайджесту не їхала на акаунт, хоча
 * сусідні тумблери вже їхали). Щільність дашборда з переїзду прибрано
 * разом зі старою сіткою (`hub-action-axis.md` PR 3).
 *
 * Найцінніше тут — НЕ те, що значення переїхало, а три випадки, коли
 * переїзд НЕ має статись: серверне значення важливіше за локальне,
 * дефолт не можна матеріалізувати, і повторний виклик не має нічого
 * робити.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./hubPrefsSync", () => ({
  pushHubPrefs: vi.fn(),
  __setHubPrefsUnsyncedAdapter: vi.fn(),
}));

import { STORAGE_KEYS } from "@sergeant/shared";
import { safeWriteLS } from "@shared/lib/storage/storage";
import { migrateLegacyHubPrefs, HUB_PREF_MONDAY_AUTO } from "./hubPrefs";

function bag(): Record<string, unknown> {
  return JSON.parse(
    localStorage.getItem(STORAGE_KEYS.HUB_PREFS) ?? "{}",
  ) as Record<string, unknown>;
}

describe("migrateLegacyHubPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("переносить ЯВНИЙ opt-out дайджесту, і саме як булеве", () => {
    safeWriteLS(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, "0");

    migrateLegacyHubPrefs();

    expect(bag()[HUB_PREF_MONDAY_AUTO]).toBe(false);
  });

  it("НЕ матеріалізує дефолт дайджесту, коли людина його не чіпала", () => {
    // Відсутність старого ключа означала «увімкнено». Записати це в мішок
    // означало б перетворити дефолт на явний вибір — і затерти ним
    // справжній вибір, зроблений на іншому пристрої.
    migrateLegacyHubPrefs();

    expect(HUB_PREF_MONDAY_AUTO in bag()).toBe(false);
  });

  it("НЕ чіпає ключ, який у мішку вже є — серверне значення важливіше", () => {
    // Міграція йде ПІСЛЯ гідратації, тож мішок тут уже може нести те, що
    // приїхало з акаунта. Перезаписати його локальним означало б відкотити
    // вибір, зроблений на іншому пристрої.
    safeWriteLS(STORAGE_KEYS.HUB_PREFS, { [HUB_PREF_MONDAY_AUTO]: true });
    // Пишемо ТИМ САМИМ хелпером, що й застосунок: сирий
    // `localStorage.setItem` обходить `webKVStore` і дає інакше
    // закодоване значення — тест перевіряв би не той кругообіг.
    safeWriteLS(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, "0");

    migrateLegacyHubPrefs();

    expect(bag()[HUB_PREF_MONDAY_AUTO]).toBe(true);
  });

  it("ідемпотентна: другий виклик нічого не змінює", () => {
    // Пишемо ТИМ САМИМ хелпером, що й застосунок: сирий
    // `localStorage.setItem` обходить `webKVStore` і дає інакше
    // закодоване значення — тест перевіряв би не той кругообіг.
    safeWriteLS(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, "0");

    migrateLegacyHubPrefs();
    const first = JSON.stringify(bag());
    migrateLegacyHubPrefs();

    expect(JSON.stringify(bag())).toBe(first);
  });

  it("не видаляє старі ключі — відкат клієнта не має знецінити вибір", () => {
    // Пишемо ТИМ САМИМ хелпером, що й застосунок: сирий
    // `localStorage.setItem` обходить `webKVStore` і дає інакше
    // закодоване значення — тест перевіряв би не той кругообіг.
    safeWriteLS(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, "0");

    migrateLegacyHubPrefs();

    expect(
      localStorage.getItem(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO),
    ).not.toBeNull();
  });
});
