// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  MIN_INSTALL_SESSIONS,
  countInstallSession,
  readInstallSessionCount,
} from "./installSessions";

/**
 * Сесія для запрошень встановлення (Chromium-банер і О-1 (а) на iOS) це
 * вкладка чи запуск застосунку, а не завантаження сторінки: до О-1 (а)
 * лічильник `pwa_session_count` ріс на кожному монтажі `usePwaInstall`,
 * тобто й на кожному перезавантаженні.
 */
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("countInstallSession", () => {
  it("перший запуск рахує одну сесію", () => {
    expect(countInstallSession()).toBe(1);
    expect(readInstallSessionCount()).toBe(1);
  });

  it("перезавантаження тієї самої вкладки сесію не додає", () => {
    countInstallSession();
    // Reload: модуль той самий, sessionStorage вкладки живий.
    countInstallSession();
    countInstallSession();
    expect(readInstallSessionCount()).toBe(1);
  });

  it("нова вкладка (порожній sessionStorage) додає сесію", () => {
    countInstallSession();
    window.sessionStorage.clear();
    expect(countInstallSession()).toBe(2);
    expect(readInstallSessionCount()).toBeGreaterThanOrEqual(
      MIN_INSTALL_SESSIONS,
    );
  });

  it("зіпсоване значення лічильника читається як нуль", () => {
    window.localStorage.setItem(STORAGE_KEYS.PWA_SESSION_COUNT, "abc");
    expect(readInstallSessionCount()).toBe(0);
    expect(countInstallSession()).toBe(1);
  });
});
