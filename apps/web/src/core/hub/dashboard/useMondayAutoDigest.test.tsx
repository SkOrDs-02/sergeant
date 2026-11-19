// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const autoGenerate = vi.hoisted(() =>
  vi.fn<() => Promise<"ok" | "insufficient" | "failed" | "skipped">>(
    async () => "ok",
  ),
);
const loadDigest = vi.hoisted(() => vi.fn<(k: string) => unknown>(() => null));
const useWeeklyDigestMock = vi.hoisted(() =>
  vi.fn((weekKey?: string) => {
    void weekKey;
    return { autoGenerate };
  }),
);
const readServerDigest = vi.hoisted(() =>
  vi.fn<(c: unknown, wk: string) => Promise<unknown>>(async () => null),
);
const adoptServerDigest = vi.hoisted(() => vi.fn());
// Реальний getWeekKey: тест пінить саме АРИФМЕТИКУ «минулий тиждень»
// (знахідка W1: авто-звіт генерував щойно-початий тиждень із нульовими
// даними), тож мокати її означало б тестувати мок.
const getWeekKey = vi.hoisted(() =>
  vi.fn((d: Date = new Date()) => {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, "0");
    const day = String(monday.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }),
);

vi.mock("../../insights/useWeeklyDigest", () => ({
  useWeeklyDigest: useWeeklyDigestMock,
  loadDigest,
  getWeekKey,
}));

vi.mock("../../insights/digestServerCopy", () => ({
  readServerDigest,
  adoptServerDigest,
}));

import { useMondayAutoDigest } from "./useMondayAutoDigest";
import { STORAGE_KEYS } from "@sergeant/shared";

// A Monday: 2026-06-22 is a Monday. The week that just ended started 06-15.
const MONDAY = new Date("2026-06-22T09:00:00");
const PREV_WEEK_KEY = "2026-06-15";
// Вівторок, середа і неділя того ж тижня: минулий тиждень для всіх той самий.
const TUESDAY = new Date("2026-06-23T09:00:00");
const TUESDAY_EVENING = new Date("2026-06-23T21:30:00");
const WEDNESDAY = new Date("2026-06-24T09:00:00");
const SUNDAY = new Date("2026-06-28T21:00:00");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mount(signedIn = true) {
  return renderHook(
    (props: { signedIn: boolean }) => useMondayAutoDigest(props),
    { wrapper, initialProps: { signedIn } },
  );
}

/** Відлік 3 с і всі мікрозадачі після нього (читання сервера, генерація). */
async function flush(ms = 3000) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  loadDigest.mockReturnValue(null);
  readServerDigest.mockResolvedValue(null);
  autoGenerate.mockResolvedValue("ok");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Явний opt-out — єдиний спосіб вимкнути (default ON з 2026-08-30). */
function disable() {
  localStorage.setItem(
    STORAGE_KEYS.HUB_PREFS,
    JSON.stringify({ mondayAutoDigest: false }),
  );
}

describe("useMondayAutoDigest — базові запобіжники", () => {
  it("НЕ генерує при явному opt-out у мішку", async () => {
    disable();
    vi.setSystemTime(MONDAY);
    mount();
    await flush(5000);
    expect(readServerDigest).not.toHaveBeenCalled();
    expect(autoGenerate).not.toHaveBeenCalled();
  });

  it("генерує без збереженого прапорця (default ON)", async () => {
    vi.setSystemTime(MONDAY);
    mount();
    await flush();
    expect(autoGenerate).toHaveBeenCalledTimes(1);
  });

  it("цілиться у ЗАВЕРШЕНИЙ тиждень, не в щойно-початий (W1)", async () => {
    vi.setSystemTime(MONDAY);
    mount();
    expect(useWeeklyDigestMock).toHaveBeenCalledWith(PREV_WEEK_KEY);
    await flush();
    expect(loadDigest).toHaveBeenCalledWith(PREV_WEEK_KEY);
    expect(readServerDigest).toHaveBeenCalledWith(
      expect.anything(),
      PREV_WEEK_KEY,
    );
    expect(autoGenerate).toHaveBeenCalledTimes(1);
  });

  it("does nothing when a digest already exists for the finished week", async () => {
    vi.setSystemTime(MONDAY);
    loadDigest.mockReturnValue({ id: "existing" });
    mount();
    await flush(5000);
    expect(readServerDigest).not.toHaveBeenCalled();
    expect(autoGenerate).not.toHaveBeenCalled();
  });

  it("skips generation if a digest lands during the defer window", async () => {
    vi.setSystemTime(MONDAY);
    mount();
    loadDigest.mockReturnValue({ id: "raced" });
    await flush();
    expect(autoGenerate).not.toHaveBeenCalled();
  });
});

// С-3 (а), рішення власника 2026-11-18 (OD-30).
describe("useMondayAutoDigest — догенерація у вівторок-неділю", () => {
  it("догенеровує у вівторок, якщо звіту за минулий тиждень немає", async () => {
    vi.setSystemTime(TUESDAY);
    mount();
    expect(useWeeklyDigestMock).toHaveBeenCalledWith(PREV_WEEK_KEY);
    await flush();
    expect(autoGenerate).toHaveBeenCalledTimes(1);
  });

  it("у неділю цілиться в минулий тиждень, а не в поточний незавершений", async () => {
    vi.setSystemTime(SUNDAY);
    mount();
    expect(useWeeklyDigestMock).toHaveBeenCalledWith(PREV_WEEK_KEY);
    expect(useWeeklyDigestMock).not.toHaveBeenCalledWith("2026-06-22");
    await flush();
    expect(autoGenerate).toHaveBeenCalledTimes(1);
  });

  it("у середу не генерує вдруге, якщо звіт уже є на пристрої", async () => {
    vi.setSystemTime(WEDNESDAY);
    loadDigest.mockReturnValue({ id: "existing" });
    mount();
    await flush(5000);
    expect(autoGenerate).not.toHaveBeenCalled();
  });

  it("у вівторок поважає opt-out так само, як у понеділок", async () => {
    disable();
    vi.setSystemTime(TUESDAY);
    mount();
    await flush(5000);
    expect(autoGenerate).not.toHaveBeenCalled();
  });

  it("без входу не шле запитів, а щойно сесія зʼявилась, працює один раз", async () => {
    vi.setSystemTime(TUESDAY);
    const { rerender } = mount(false);
    await flush(5000);
    expect(readServerDigest).not.toHaveBeenCalled();
    expect(autoGenerate).not.toHaveBeenCalled();
    rerender({ signedIn: true });
    await flush();
    expect(autoGenerate).toHaveBeenCalledTimes(1);
    rerender({ signedIn: false });
    rerender({ signedIn: true });
    await flush(5000);
    expect(readServerDigest).toHaveBeenCalledTimes(1);
    expect(autoGenerate).toHaveBeenCalledTimes(1);
  });
});

describe("useMondayAutoDigest — звіт з іншого пристрою", () => {
  it("звіт є на сервері → кладе його на пристрій і модель не викликає", async () => {
    vi.setSystemTime(WEDNESDAY);
    const serverDigest = { weekKey: PREV_WEEK_KEY, generatedAt: "x" };
    readServerDigest.mockResolvedValue(serverDigest);
    mount();
    await flush();
    expect(adoptServerDigest).toHaveBeenCalledWith(
      expect.anything(),
      serverDigest,
    );
    expect(autoGenerate).not.toHaveBeenCalled();
  });

  it("сервер порожній → генерація як раніше", async () => {
    vi.setSystemTime(WEDNESDAY);
    mount();
    await flush();
    expect(readServerDigest).toHaveBeenCalledTimes(1);
    expect(adoptServerDigest).not.toHaveBeenCalled();
    expect(autoGenerate).toHaveBeenCalledTimes(1);
  });

  it("читання впало → цей прохід без генерації, наступне відкриття пробує знову", async () => {
    vi.setSystemTime(WEDNESDAY);
    readServerDigest.mockRejectedValueOnce(new Error("timeout"));
    const first = mount();
    await flush(5000);
    expect(autoGenerate).not.toHaveBeenCalled();
    first.unmount();

    mount();
    await flush();
    expect(readServerDigest).toHaveBeenCalledTimes(2);
    expect(autoGenerate).toHaveBeenCalledTimes(1);
  });

  it("звіт приземлився на пристрої, поки йшло читання → нічого не робить", async () => {
    vi.setSystemTime(WEDNESDAY);
    readServerDigest.mockImplementation(async () => {
      loadDigest.mockReturnValue({ id: "other-tab" });
      return null;
    });
    mount();
    await flush();
    expect(autoGenerate).not.toHaveBeenCalled();
  });
});

describe("useMondayAutoDigest — повтор після INSUFFICIENT_DATA", () => {
  it("того самого дня другого запиту немає, наступного дня є", async () => {
    vi.setSystemTime(TUESDAY);
    autoGenerate.mockResolvedValue("insufficient");
    const first = mount();
    await flush();
    expect(autoGenerate).toHaveBeenCalledTimes(1);
    first.unmount();

    // Той самий день, нове відкриття хаба: ні читання, ні генерації.
    vi.setSystemTime(TUESDAY_EVENING);
    const second = mount();
    await flush(5000);
    expect(readServerDigest).toHaveBeenCalledTimes(1);
    expect(autoGenerate).toHaveBeenCalledTimes(1);
    second.unmount();

    // Наступного дня дані минулого тижня могли доїхати синком.
    vi.setSystemTime(WEDNESDAY);
    autoGenerate.mockResolvedValue("ok");
    mount();
    await flush();
    expect(autoGenerate).toHaveBeenCalledTimes(2);
  });

  it("успішна генерація чи збій мережі маркер не ставлять", async () => {
    vi.setSystemTime(TUESDAY);
    autoGenerate.mockResolvedValue("failed");
    const first = mount();
    await flush();
    first.unmount();
    mount();
    await flush();
    expect(autoGenerate).toHaveBeenCalledTimes(2);
    expect(
      localStorage.getItem(STORAGE_KEYS.WEEKLY_DIGEST_AUTO_ATTEMPT),
    ).toBeNull();
  });

  it("маркер іншого тижня не блокує поточний", async () => {
    vi.setSystemTime(TUESDAY);
    localStorage.setItem(
      STORAGE_KEYS.WEEKLY_DIGEST_AUTO_ATTEMPT,
      JSON.stringify({ weekKey: "2026-06-08", dayKey: "2026-06-23" }),
    );
    mount();
    await flush();
    expect(autoGenerate).toHaveBeenCalledTimes(1);
  });
});
