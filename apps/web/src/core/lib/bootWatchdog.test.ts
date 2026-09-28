// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Сам сторож живе в `public/boot-watchdog.js` (звичайний скрипт до entry-
// модуля, див. шапку файлу). Тут він виконується як є; vitest стартує з
// кореня пакета `apps/web`.
const SOURCE = readFileSync(
  resolve(process.cwd(), "public/boot-watchdog.js"),
  "utf8",
);

function boot(): void {
  new Function(SOURCE)();
  window.dispatchEvent(new Event("load"));
  vi.advanceTimersByTime(8000);
}

describe("boot-watchdog", () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"></div>';
    sessionStorage.clear();
    reload.mockReset();
    Object.defineProperty(window, "location", {
      value: { reload },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("перезавантажує, якщо застосунок так і не змонтувався", () => {
    boot();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("не чіпає змонтований застосунок", () => {
    document.getElementById("root")!.append(document.createElement("div"));
    boot();
    expect(reload).not.toHaveBeenCalled();
  });

  it("не перезавантажує вдруге протягом хвилини", () => {
    boot();
    boot();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("без sessionStorage не перезавантажує, щоб не зациклитись", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    boot();
    expect(reload).not.toHaveBeenCalled();
  });
});
