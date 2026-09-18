// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { getSyncTone } from "./SyncIndicator";

describe("getSyncTone", () => {
  it("returns the disconnected tone when not connected", () => {
    const tone = getSyncTone({ status: "success" }, false);
    expect(tone.text).toBe("не підключено");
    expect(tone.dot).toBe("bg-muted");
    expect(tone.icon).toBe("wifi-off");
  });

  it("returns the error tone for status=error", () => {
    const tone = getSyncTone({ status: "error" });
    expect(tone.text).toBe("помилка");
    expect(tone.dot).toBe("bg-danger");
    expect(tone.icon).toBe("alert-circle");
  });

  it("returns the partial tone for status=partial", () => {
    const tone = getSyncTone({ status: "partial" });
    expect(tone.text).toBe("частково");
    expect(tone.dot).toBe("bg-warning");
    expect(tone.icon).toBe("alert-triangle");
  });

  it("returns the loading tone for status=loading", () => {
    const tone = getSyncTone({ status: "loading" });
    expect(tone.text).toBe("оновлення");
    expect(tone.dot).toBe("bg-muted");
    expect(tone.icon).toBe("refresh-cw");
  });

  it("returns the ok tone only for status=success", () => {
    const tone = getSyncTone({ status: "success" });
    expect(tone.text).toBe("ок");
    expect(tone.dot).toBe("bg-success");
    expect(tone.icon).toBe("check-circle");
  });

  // Regression PR-F7 (аудит 2026-09-13): фолбек віддавав зелений «ок» на все
  // невідоме, тож `idle` — тобто вебхук `disconnected` або стан, який ще не
  // приїхав, — читався як «усе гаразд». Два сусіди по тому самому енуму так
  // не роблять: `SyncStatusBadge` дає «Очікування», `TransactionSyncPill`
  // ховає рядок. Зелене має бути заслуженим, тож фолбек нейтральний.
  it("never claims ok for idle / unknown / missing status", () => {
    for (const state of [
      undefined,
      null,
      {},
      { status: "idle" },
      { status: "whatever" },
    ]) {
      const tone = getSyncTone(state);
      expect(tone.text).toBe("очікування");
      expect(tone.dot).not.toBe("bg-success");
      expect(tone.icon).not.toBe("check-circle");
    }
  });

  // Regression: founder report 2026-07-31 — «Бейдж ок перекриває хедер
  // модуля». The header row is fixed-width on a phone; the healthy pill costs
  // ~54px there while carrying no text (`hidden sm:inline`), which squeezed
  // the module title out. `needsAttention` is the flag `SyncPill` uses to hide
  // only the uninformative "ок" state on narrow viewports.
  it("marks only the healthy tone as not needing attention", () => {
    expect(getSyncTone({ status: "success" }).needsAttention).toBe(false);
  });

  it("marks every actionable tone as needing attention", () => {
    expect(getSyncTone({ status: "success" }, false).needsAttention).toBe(true);
    expect(getSyncTone({ status: "error" }).needsAttention).toBe(true);
    expect(getSyncTone({ status: "partial" }).needsAttention).toBe(true);
    expect(getSyncTone({ status: "loading" }).needsAttention).toBe(true);
    expect(getSyncTone({ status: "idle" }).needsAttention).toBe(true);
    expect(getSyncTone(undefined).needsAttention).toBe(true);
  });

  // Пін на сам енум: п'ять станів мусять давати п'ять РІЗНИХ іконок, бо на
  // вузьких екранах текст лейбла схований (`hidden sm:inline`) і іконка —
  // єдиний не-кольоровий канал стану.
  it("gives every status its own non-colour channel", () => {
    const icons = [
      getSyncTone({ status: "success" }, false).icon,
      getSyncTone({ status: "error" }).icon,
      getSyncTone({ status: "partial" }).icon,
      getSyncTone({ status: "loading" }).icon,
      getSyncTone({ status: "idle" }).icon,
    ];
    expect(new Set(icons).size).toBe(icons.length);
  });
});
