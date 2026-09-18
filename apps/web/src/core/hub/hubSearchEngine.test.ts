// @vitest-environment jsdom
/**
 * Юніт-тести функцій hubSearchEngine.ts.
 *
 * Модуль зберігає останні пошукові запити у localStorage.
 * Тестуємо getRecentQueries / pushRecentQuery / clearRecentQueries:
 *  - початковий стан — порожній масив
 *  - push додає запит на початок
 *  - дублікат переміщається на початок (dedup)
 *  - кількість елементів обрізається до RECENTS_CAP (5)
 *  - порожній рядок ігнорується
 *  - clearRecentQueries очищає сховище
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  clearRecentQueries,
  getRecentQueries,
  pushRecentQuery,
} from "./hubSearchEngine";

beforeEach(() => {
  localStorage.clear();
});

describe("hubSearchEngine — recent queries", () => {
  describe("getRecentQueries", () => {
    it("повертає порожній масив коли ключ відсутній", () => {
      expect(getRecentQueries()).toEqual([]);
    });

    it("повертає збережені запити", () => {
      localStorage.setItem(
        "hub_search_recents_v1",
        JSON.stringify(["запит 1", "запит 2"]),
      );
      expect(getRecentQueries()).toEqual(["запит 1", "запит 2"]);
    });

    it("ігнорує нерядкові елементи при зчитуванні", () => {
      localStorage.setItem(
        "hub_search_recents_v1",
        JSON.stringify(["valid", 42, null, "also valid"]),
      );
      expect(getRecentQueries()).toEqual(["valid", "also valid"]);
    });

    it("повертає порожній масив при malformed JSON", () => {
      localStorage.setItem("hub_search_recents_v1", "not-json");
      expect(getRecentQueries()).toEqual([]);
    });
  });

  describe("pushRecentQuery", () => {
    it("додає запит до порожнього сховища", () => {
      const result = pushRecentQuery("Вітамін D");
      expect(result).toEqual(["Вітамін D"]);
      expect(getRecentQueries()).toEqual(["Вітамін D"]);
    });

    it("додає новий запит на початок списку", () => {
      pushRecentQuery("перший");
      const result = pushRecentQuery("другий");
      expect(result[0]).toBe("другий");
      expect(result[1]).toBe("перший");
    });

    it("дублікат переміщається на початок (dedup)", () => {
      pushRecentQuery("a");
      pushRecentQuery("b");
      pushRecentQuery("c");
      const result = pushRecentQuery("a"); // already exists
      expect(result[0]).toBe("a");
      expect(result.filter((v) => v === "a")).toHaveLength(1); // not duplicated
    });

    it("обрізає до 5 елементів (RECENTS_CAP)", () => {
      pushRecentQuery("1");
      pushRecentQuery("2");
      pushRecentQuery("3");
      pushRecentQuery("4");
      pushRecentQuery("5");
      const result = pushRecentQuery("6");
      expect(result).toHaveLength(5);
      expect(result[0]).toBe("6");
      expect(result).not.toContain("1"); // oldest is dropped
    });

    it("порожній рядок ігнорується — повертає поточний список", () => {
      pushRecentQuery("existing");
      const before = getRecentQueries();
      const result = pushRecentQuery("  ");
      expect(result).toEqual(before);
    });

    it("тримає лише рядки (trim застосовується)", () => {
      const result = pushRecentQuery("  пошук  ");
      expect(result[0]).toBe("пошук"); // trimmed
    });
  });

  describe("clearRecentQueries", () => {
    it("видаляє всі збережені запити", () => {
      pushRecentQuery("a");
      pushRecentQuery("b");
      clearRecentQueries();
      expect(getRecentQueries()).toEqual([]);
    });

    it("виклик на порожньому сховищі — no-op (не кидає)", () => {
      expect(() => clearRecentQueries()).not.toThrow();
    });
  });
});
