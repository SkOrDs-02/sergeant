/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Переїзд двох хабових налаштувань зі своїх ключів у спільний мішок
 * (залишок PR-S13: щільність і автогенерація дайджесту не їхали на
 * акаунт, хоча пʼять сусідніх тумблерів уже їхали).
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
import {
  migrateLegacyHubPrefs,
  HUB_PREF_DENSITY,
  HUB_PREF_MONDAY_AUTO,
} from "./hubPrefs";

function bag(): Record<string, unknown> {
  return JSON.parse(
    localStorage.getItem(STORAGE_KEYS.HUB_PREFS) ?? "{}",
  ) as Record<string, unknown>;
}

describe("migrateLegacyHubPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("переносить збережену щільність у мішок", () => {
    // Пишемо ТИМ САМИМ хелпером, що й застосунок: сирий
    // `localStorage.setItem` обходить `webKVStore` і дає інакше
    // закодоване значення — тест перевіряв би не той кругообіг.
    safeWriteLS(STORAGE_KEYS.DASHBOARD_DENSITY, "compact");

    migrateLegacyHubPrefs();

    expect(bag()[HUB_PREF_DENSITY]).toBe("compact");
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
    safeWriteLS(STORAGE_KEYS.HUB_PREFS, { [HUB_PREF_DENSITY]: "cozy" });
    // Пишемо ТИМ САМИМ хелпером, що й застосунок: сирий
    // `localStorage.setItem` обходить `webKVStore` і дає інакше
    // закодоване значення — тест перевіряв би не той кругообіг.
    safeWriteLS(STORAGE_KEYS.DASHBOARD_DENSITY, "compact");

    migrateLegacyHubPrefs();

    expect(bag()[HUB_PREF_DENSITY]).toBe("cozy");
  });

  it("ідемпотентна: другий виклик нічого не змінює", () => {
    // Пишемо ТИМ САМИМ хелпером, що й застосунок: сирий
    // `localStorage.setItem` обходить `webKVStore` і дає інакше
    // закодоване значення — тест перевіряв би не той кругообіг.
    safeWriteLS(STORAGE_KEYS.DASHBOARD_DENSITY, "compact");

    migrateLegacyHubPrefs();
    const first = JSON.stringify(bag());
    migrateLegacyHubPrefs();

    expect(JSON.stringify(bag())).toBe(first);
  });

  it("не видаляє старі ключі — відкат клієнта не має знецінити вибір", () => {
    // Пишемо ТИМ САМИМ хелпером, що й застосунок: сирий
    // `localStorage.setItem` обходить `webKVStore` і дає інакше
    // закодоване значення — тест перевіряв би не той кругообіг.
    safeWriteLS(STORAGE_KEYS.DASHBOARD_DENSITY, "compact");

    migrateLegacyHubPrefs();

    expect(localStorage.getItem(STORAGE_KEYS.DASHBOARD_DENSITY)).not.toBeNull();
  });
});
