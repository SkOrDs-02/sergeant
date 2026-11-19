/**
 * Звіт inline-сторожа білого екрана (DURABILITY-20261008-BOOT-1).
 *
 * Сторож у `index.html` не має мережі й Sentry: у момент спрацювання
 * підресурси висять. Він лише кладе знімок у `sessionStorage` під цим ключем
 * (разом зі знімком fetch-буфера SW) і виконує відновлення. Тут, на ПОДАЛЬШОМУ
 * буті, знімок читається, видаляється і йде в Sentry звичайним шляхом.
 *
 * Лише шляхи без query і службові лічильники, жодних id чи токенів.
 */

import { logger } from "@shared/lib";
import { safeReadStringSS, safeRemoveSS } from "@shared/lib/storage/storage";
import { captureException } from "./sentry.js";

/** Має збігатися зі скриптом у `index.html`. */
export const BOOT_WATCHDOG_REPORT_KEY = "sergeant.boot_watchdog_report";

/** Верхня межа розміру, який ми готові слати (байти JSON). */
const MAX_REPORT_CHARS = 24_000;

export interface BootWatchdogReport {
  /** Epoch ms спрацювання. */
  at: number;
  /** `document.readyState` у момент спрацювання. */
  rs: string;
  /** Чи контролював сторінку SW. */
  ctl: boolean;
  /** Що зробив сторож: `bypass` (unregister SW + reload), `reload`, `none`. */
  act: "bypass" | "reload" | "none";
  /** Знімок `fetchDiag` із SW або `null` (немає контролера / таймаут). */
  snap: unknown;
}

export function parseBootWatchdogReport(
  raw: string | null,
): BootWatchdogReport | null {
  if (!raw || raw.length > MAX_REPORT_CHARS) return null;
  try {
    const v = JSON.parse(raw) as Partial<BootWatchdogReport> | null;
    if (!v || typeof v !== "object" || typeof v.at !== "number") return null;
    return {
      at: v.at,
      rs: typeof v.rs === "string" ? v.rs : "?",
      ctl: v.ctl === true,
      act: v.act === "bypass" || v.act === "reload" ? v.act : "none",
      snap: v.snap ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Читає й одразу видаляє звіт (одноразово). Повертає `true`, якщо було що
 * слати. Викликати після `initSentry()`: до завантаження SDK
 * `captureException` мовчки нічого не робить.
 */
export function reportBootWatchdogIfAny(): boolean {
  const report = parseBootWatchdogReport(
    safeReadStringSS(BOOT_WATCHDOG_REPORT_KEY),
  );
  safeRemoveSS(BOOT_WATCHDOG_REPORT_KEY);
  if (!report) return false;
  logger.warn("boot watchdog fired on previous load", {
    act: report.act,
    rs: report.rs,
  });
  captureException(new Error("boot watchdog: #root stayed empty"), {
    level: "warning",
    tags: {
      "boot_watchdog.action": report.act,
      "boot_watchdog.ready_state": report.rs,
      "boot_watchdog.controlled": String(report.ctl),
    },
    extra: { report },
    // Одна група в Sentry незалежно від стеку.
    fingerprint: ["boot-watchdog", report.act],
  });
  return true;
}
