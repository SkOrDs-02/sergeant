/**
 * Структурний сигнал успіху для tool-call-ів.
 *
 * Доти успіх/провал кодувався ЛИШЕ префіксом тексту результату («Помилка
 * виконання: …», «Невідома дія: …», `WRITE_NOT_PERSISTED`). Будь-який
 * зовнішній споживач — телеметрія `hubchat_tool_invoked` у першу чергу —
 * мусив би винюхувати копірайт, тобто тихо зламався б на першому ж
 * переписуванні формулювання.
 *
 * Ці тести пінять саме `ok`, а не текст: якщо колись повернуть виведення
 * успіху з рядка, вони впадуть.
 *
 * AI-NOTE: інструмент тут — синтетичний `__ok_probe__`, і йде він через
 * `handleCrossAction` (останній у ланцюжку `dispatch`). Це навмисно:
 * реальні імена на кшталт `create_transaction` лежать в
 * `ASYNC_CHAT_ACTION_NAMES` і виконуються ІНШОЮ гілкою `executeActions`,
 * тож мок sync-хендлера на них просто не спрацьовує (на це я вже
 * наступив, пишучи цей файл).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const crossMock = vi.fn();

vi.mock("./chatActions/crossActions", async (orig) => {
  const actual = await orig<typeof import("./chatActions/crossActions")>();
  return {
    ...actual,
    handleCrossAction: (a: unknown) => crossMock(a),
  };
});

const PROBE = [{ name: "__ok_probe__", input: {} }] as never;

async function runProbe() {
  vi.resetModules();
  const { executeActions } = await import("./hubChatActions");
  const [r] = await executeActions(PROBE);
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  crossMock.mockReturnValue(undefined);
});

describe("executeActions — ok як структурний сигнал", () => {
  it("успішний хендлер → ok: true", async () => {
    crossMock.mockReturnValue("Готово");
    const r = await runProbe();
    expect(r?.ok).toBe(true);
    expect(r?.result).toBe("Готово");
  });

  it("жоден хендлер не взяв виклик → ok: false", async () => {
    // `crossMock` лишається `undefined` — ланцюжок дійшов до кінця.
    const r = await runProbe();
    expect(r?.ok).toBe(false);
    expect(r?.result).toContain("Невідома дія");
  });

  it("хендлер кинув → ok: false, і виняток не тече назовні", async () => {
    crossMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const r = await runProbe();
    expect(r?.ok).toBe(false);
    expect(r?.result).toContain("boom");
  });

  it("запис не долетів до локальної бази → ok: false, хоч хендлер не кинув", async () => {
    // Найтонший випадок і причина, чому прапорець дораховується в `settle`,
    // а не лише в `dispatch`: хендлер відпрацював штатно, але `confirm`
    // сказав «не збережено». Саме це дало F-12 («зробив це» при лічильнику
    // 0/3), і рахувати такий виклик успішним означало б leaderboard із
    // фантомними інструментами.
    crossMock.mockReturnValue({
      result: "Відмітив",
      confirm: Promise.resolve(false),
    });
    const r = await runProbe();
    expect(r?.ok).toBe(false);
  });

  it("запис підтверджено → ok: true", async () => {
    crossMock.mockReturnValue({
      result: "Відмітив",
      confirm: Promise.resolve(true),
    });
    const r = await runProbe();
    expect(r?.ok).toBe(true);
  });

  it("latencyMs присутній і невідʼємний для КОЖНОГО виклику батчу", async () => {
    crossMock.mockReturnValue("Готово");
    vi.resetModules();
    const { executeActions } = await import("./hubChatActions");
    const rs = await executeActions([
      { name: "__ok_probe__", input: {} },
      { name: "__ok_probe__", input: {} },
    ] as never);
    expect(rs).toHaveLength(2);
    for (const r of rs) {
      expect(typeof r.latencyMs).toBe("number");
      expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });
});
