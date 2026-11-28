// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { act } from "react";
import {
  __resetInitialPullStateForTests,
  markFirstPullPending,
  markFirstPullSettled,
} from "../../core/syncEngine/initialPullState";
import {
  markStorageBooting,
  markStorageReady,
} from "../../core/db/storageReady";

// Мок саме `useToast`, а не рендер `ToastProvider`: провайдер кладе плашку в
// стан через власну чергу коалесингу, тож перевірка по DOM ганялася б за його
// таймінгом замість контракту хука. Тут предмет інший — ЩО і СКІЛЬКИ РАЗІВ
// хук просить показати.
const toastSuccess = vi.fn();
vi.mock("./useToast", () => ({
  useToast: () => ({ success: toastSuccess }),
}));

const { useStreakMilestoneCelebration } =
  await import("./useStreakMilestoneCelebration");

function Probe({ streak }: { streak: number | null }) {
  useStreakMilestoneCelebration("test-scope", streak, "{days} днів");
  return null;
}

const renderProbe = (streak: number | null) =>
  render(<Probe streak={streak} />);

describe("useStreakMilestoneCelebration", () => {
  beforeEach(() => {
    localStorage.clear();
    toastSuccess.mockClear();
    __resetInitialPullStateForTests();
  });
  afterEach(() => {
    cleanup();
    markStorageReady();
  });

  it("перший рендер ЗАСІВАЄ і не святкує вже пройдене", () => {
    renderProbe(45);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("показує плашку на віху після засіву — 4000 мс, як вирішив власник", () => {
    renderProbe(1).unmount();
    renderProbe(7);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("7 днів", 4000);
  });

  // Регресія: саме на цьому провалювався детектор у хабі — повернення на
  // маршрут ремонтує компонент, і порівняння з ref-ом бачило вже перетнуте
  // число. Зайняття переживає ремаунт, бо лежить у сховищі пристрою.
  it("ремаунт не показує ту саму віху вдруге", () => {
    renderProbe(1).unmount();
    renderProbe(7).unmount();
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    renderProbe(7);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("стрибок через кілька віх святкує найвищу, а не найнижчу", () => {
    renderProbe(1).unmount();
    renderProbe(45);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("30 днів", 4000);
  });

  it("не показує плашку поверх відкритого аркуша, а чекає його закриття", async () => {
    renderProbe(1).unmount();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    renderProbe(7);
    expect(toastSuccess).not.toHaveBeenCalled();
    dialog.remove();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledWith("7 днів", 4000);
  });

  it("`null` пропускається — це «ще не порахували», а не нуль", () => {
    renderProbe(null).unmount();
    // Засіву не сталося, тож наступне справжнє значення його зробить —
    // і саме тому 7 тут НЕ святкується.
    renderProbe(7);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  // FULL-20261126-ROUTINE-2: свіжий вхід. Серія спершу 0 (дані ще не
  // дійшли), потім приходить 13 з першого pull. Без фіксу 0 засівало, а
  // 13 «досягало» віхи 7 і давало тост при героєві 13.
  it("гідрація 0 → 13 під час першого pull не святкується", () => {
    markFirstPullPending();
    const view = render(<Probe streak={0} />);
    view.rerender(<Probe streak={13} />);
    act(() => markFirstPullSettled());
    expect(toastSuccess).not.toHaveBeenCalled();
    // Справжня дія людини далі працює: 13 засіяно, 30 святкується.
    view.rerender(<Probe streak={30} />);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("30 днів", 4000);
  });

  it("гідрація 0 → 13 без сигналу pull (серія спершу 0 при idle) теж не святкується", () => {
    const view = render(<Probe streak={0} />);
    view.rerender(<Probe streak={13} />);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("поки сховище бутиться, серія не читається", () => {
    markStorageBooting();
    const view = render(<Probe streak={0} />);
    view.rerender(<Probe streak={13} />);
    act(() => markStorageReady());
    expect(toastSuccess).not.toHaveBeenCalled();
    view.rerender(<Probe streak={30} />);
    expect(toastSuccess).toHaveBeenCalledWith("30 днів", 4000);
  });
});
