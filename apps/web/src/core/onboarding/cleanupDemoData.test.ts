/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Гейт одноразового прибирання FTUX-демоданих — на СПРАВЖНІХ хелперах
 * сховища, без моку.
 *
 * Мок тут був, і саме він ховав баг. Він тримав `Map<string, unknown>`:
 * `safeWriteLS` клав значення як є, `safeReadLS` віддавав його ж. Для
 * масивів і обʼєктів це збігається з реальним JSON-кругообігом, а для
 * РЯДКА — ні, і весь баг жив саме на рядку. Справжній `safeWriteLS`
 * пропускає рядок наскрізь, без лапок, тож прапорець завершення лежить у
 * сховищі як один символ `1`; `safeReadLS` розбирає його як JSON і
 * повертає ЧИСЛО 1. Предикат `=== "1"` був хибним ЗАВЖДИ — охоронець не
 * спрацьовував жодного разу, прибирання йшло на кожному буті. При цьому
 * ДВА тести в цьому ж файлі стверджували протилежне і були зелені, бо в
 * мокованому сховищі рядок лишався рядком.
 *
 * Тому мок прибрано, а не полагоджено: «досить близько до реального
 * кругообігу» — це саме та обіцянка, яка тут не витримала.
 *
 * Ціна — `jsdom` замість `node`-середовища. «Нічого не записано» тепер
 * доводиться лічильником записів у сховище, а не тотожністю посилання
 * (після справжнього JSON-кругообігу обʼєкт завжди новий).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { runDemoCleanupOnce } from "./cleanupDemoData";

const CLEANUP_DONE_KEY = "hub_demo_cleanup_v1_done";
const LEGACY_SEEDED_FLAG_KEY = "hub_demo_seeded_v1";
const LEGACY_BANNER_DISMISSED_KEY = "hub_demo_banner_dismissed_v1";
const FINYK_MANUAL_EXPENSES_KEY = "finyk_manual_expenses_v1";
const FIZRUK_WORKOUTS_KEY = "fizruk_workouts_v1";
const ROUTINE_STATE_KEY = "hub_routine_v1";
const NUTRITION_LOG_KEY = "nutrition_log_v1";

/** Скільки разів прибирання записало саме цей ключ. */
function countWrites(key: string, run: () => void): number {
  const spy = vi.spyOn(Storage.prototype, "setItem");
  try {
    run();
    return spy.mock.calls.filter((c) => c[0] === key).length;
  } finally {
    spy.mockRestore();
  }
}

describe("runDemoCleanupOnce", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("нічого не робить, коли прапорець завершення вже стоїть", () => {
    safeWriteLS(CLEANUP_DONE_KEY, "1");
    safeWriteLS(FINYK_MANUAL_EXPENSES_KEY, [{ demo: true }]);
    runDemoCleanupOnce();
    // Недоторкано — охоронець виходить до першого прибиральника.
    expect(safeReadLS(FINYK_MANUAL_EXPENSES_KEY)).toEqual([{ demo: true }]);
  });

  it("прибирає демо-витрати Фініка і лишає справжні", () => {
    safeWriteLS(FINYK_MANUAL_EXPENSES_KEY, [
      { id: "a", demo: true },
      { id: "b" },
      { id: "c", demo: false },
    ]);
    runDemoCleanupOnce();
    expect(safeReadLS(FINYK_MANUAL_EXPENSES_KEY)).toEqual([
      { id: "b" },
      { id: "c", demo: false },
    ]);
  });

  it("не чіпає Фініка, коли демо-записів немає — і не пише у сховище", () => {
    safeWriteLS(FINYK_MANUAL_EXPENSES_KEY, [{ id: "b" }]);
    const writes = countWrites(FINYK_MANUAL_EXPENSES_KEY, runDemoCleanupOnce);
    expect(writes).toBe(0);
    expect(safeReadLS(FINYK_MANUAL_EXPENSES_KEY)).toEqual([{ id: "b" }]);
  });

  it("прибирає демо-тренування Фізрука у формі масиву", () => {
    safeWriteLS(FIZRUK_WORKOUTS_KEY, [{ id: "a", demo: true }, { id: "b" }]);
    runDemoCleanupOnce();
    expect(safeReadLS(FIZRUK_WORKOUTS_KEY)).toEqual([{ id: "b" }]);
  });

  it("прибирає демо-тренування Фізрука у формі обʼєкта", () => {
    safeWriteLS(FIZRUK_WORKOUTS_KEY, {
      schemaVersion: 1,
      workouts: [{ id: "a", demo: true }, { id: "b" }],
    });
    runDemoCleanupOnce();
    expect(safeReadLS(FIZRUK_WORKOUTS_KEY)).toEqual({
      schemaVersion: 1,
      workouts: [{ id: "b" }],
    });
  });

  it("прибирає демо-звички разом із відмітками і порядком", () => {
    safeWriteLS(ROUTINE_STATE_KEY, {
      habits: [{ id: "h1", demo: true }, { id: "h2" }],
      completions: { h1: ["2026-01-01"], h2: ["2026-01-02"] },
      habitOrder: ["h1", "h2"],
    });
    runDemoCleanupOnce();
    expect(safeReadLS(ROUTINE_STATE_KEY)).toEqual({
      habits: [{ id: "h2" }],
      completions: { h2: ["2026-01-02"] },
      habitOrder: ["h2"],
    });
  });

  it("не чіпає звички, коли демо серед них немає — і не пише у сховище", () => {
    safeWriteLS(ROUTINE_STATE_KEY, { habits: [{ id: "h2" }] });
    const writes = countWrites(ROUTINE_STATE_KEY, runDemoCleanupOnce);
    expect(writes).toBe(0);
    expect(safeReadLS(ROUTINE_STATE_KEY)).toEqual({ habits: [{ id: "h2" }] });
  });

  it("прибирає демо-прийоми їжі і викидає спорожнілі дні", () => {
    safeWriteLS(NUTRITION_LOG_KEY, {
      "2026-01-01": { meals: [{ demo: true }] },
      "2026-01-02": { meals: [{ demo: true }, { id: "real" }] },
      "2026-01-03": { notMeals: true },
    });
    runDemoCleanupOnce();
    expect(safeReadLS(NUTRITION_LOG_KEY)).toEqual({
      "2026-01-02": { meals: [{ id: "real" }] },
      "2026-01-03": { notMeals: true },
    });
  });

  it("знімає застарілі прапорці і ставить прапорець завершення", () => {
    safeWriteLS(LEGACY_SEEDED_FLAG_KEY, "1");
    safeWriteLS(LEGACY_BANNER_DISMISSED_KEY, "1");
    runDemoCleanupOnce();
    expect(localStorage.getItem(LEGACY_SEEDED_FLAG_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_BANNER_DISMISSED_KEY)).toBeNull();
    expect(localStorage.getItem(CLEANUP_DONE_KEY)).toBe("1");
  });

  it("ідемпотентна: другий виклик — не операція (охоронець AI-DANGER)", () => {
    safeWriteLS(FINYK_MANUAL_EXPENSES_KEY, [{ id: "a", demo: true }]);
    runDemoCleanupOnce();
    expect(safeReadLS(FINYK_MANUAL_EXPENSES_KEY)).toEqual([]);

    // Підсовуємо демо-запис знову. Якщо охоронець працює, прибирання
    // навіть не запуститься і запис лишиться на місці. Це і є та
    // властивість, яку декларує AI-DANGER над функцією, — і рівно вона
    // не виконувалась, поки предикат порівнював число з рядком.
    safeWriteLS(FINYK_MANUAL_EXPENSES_KEY, [{ id: "b", demo: true }]);
    runDemoCleanupOnce();

    expect(safeReadLS(FINYK_MANUAL_EXPENSES_KEY)).toEqual([
      { id: "b", demo: true },
    ]);
  });

  it("прапорець лягає у сховище голим символом, а JSON-розбір дає ЧИСЛО", () => {
    // Пін на КОДУВАННЯ, а не на поведінку: саме розбіжність «пишемо
    // рядком → читаємо JSON-розбором» зробила охоронця мертвим. Якщо
    // хтось колись переведе читання назад на `safeReadLS`, цей тест
    // назве причину, а не наслідок.
    runDemoCleanupOnce();

    expect(localStorage.getItem(CLEANUP_DONE_KEY)).toBe("1");
    expect(safeReadLS(CLEANUP_DONE_KEY)).toBe(1);
  });
});
