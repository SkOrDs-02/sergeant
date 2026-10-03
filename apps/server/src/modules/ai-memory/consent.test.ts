/** Status: Active. */

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { hasAiMemoryConsent, hasHealthDataConsent } from "./consent.js";

function dbWithRows(rows: Array<{ ai_memory: boolean | null }>): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

describe("hasAiMemoryConsent", () => {
  it("keeps default=true when preferences do not exist yet", async () => {
    await expect(hasAiMemoryConsent(dbWithRows([]), "u1")).resolves.toBe(true);
  });

  it("allows only an explicitly enabled persisted preference", async () => {
    await expect(
      hasAiMemoryConsent(dbWithRows([{ ai_memory: true }]), "u1"),
    ).resolves.toBe(true);
    await expect(
      hasAiMemoryConsent(dbWithRows([{ ai_memory: false }]), "u1"),
    ).resolves.toBe(false);
    await expect(
      hasAiMemoryConsent(dbWithRows([{ ai_memory: null }]), "u1"),
    ).resolves.toBe(false);
  });
});

/**
 * PR-S3 (рішення founder-а 2026-09-14). Дефолт тут ПРОТИЛЕЖНИЙ до
 * `hasAiMemoryConsent` вище, і це головне, що ці тести пінують: памʼять
 * увімкнена за замовчуванням, згода на дані про здоровʼя — ні (колонка
 * `NOT NULL DEFAULT FALSE`, міграція 111; застосунок дефолтить так само).
 */
function dbWithHealthRows(
  rows: Array<{ health_data_consent: boolean | null }>,
): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

describe("hasHealthDataConsent", () => {
  it("fails closed when preferences do not exist yet", async () => {
    // Найважливіший рядок цього файлу. Відсутній рядок налаштувань — це
    // «згоди не давали», а не «згода є»: більшість людей ніколи не
    // відкривала Налаштування → Приватність, і тлумачити мовчання як
    // згоду означало б вигадати її.
    await expect(
      hasHealthDataConsent(dbWithHealthRows([]), "u1"),
    ).resolves.toBe(false);
  });

  it("allows only an explicitly enabled persisted preference", async () => {
    await expect(
      hasHealthDataConsent(
        dbWithHealthRows([{ health_data_consent: true }]),
        "u1",
      ),
    ).resolves.toBe(true);
    await expect(
      hasHealthDataConsent(
        dbWithHealthRows([{ health_data_consent: false }]),
        "u1",
      ),
    ).resolves.toBe(false);
    await expect(
      hasHealthDataConsent(
        dbWithHealthRows([{ health_data_consent: null }]),
        "u1",
      ),
    ).resolves.toBe(false);
  });
});
