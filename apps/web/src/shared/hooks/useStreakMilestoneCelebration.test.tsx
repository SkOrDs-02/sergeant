// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

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
  });
  afterEach(cleanup);

  it("перший рендер ЗАСІВАЄ і не святкує вже пройдене", () => {
    renderProbe(45);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("показує плашку на віху після засіву — 4000 мс, як вирішив власник", () => {
    renderProbe(0).unmount();
    renderProbe(7);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("7 днів", 4000);
  });

  // Регресія: саме на цьому провалювався детектор у хабі — повернення на
  // маршрут ремонтує компонент, і порівняння з ref-ом бачило вже перетнуте
  // число. Зайняття переживає ремаунт, бо лежить у сховищі пристрою.
  it("ремаунт не показує ту саму віху вдруге", () => {
    renderProbe(0).unmount();
    renderProbe(7).unmount();
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    renderProbe(7);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("стрибок через кілька віх святкує найвищу, а не найнижчу", () => {
    renderProbe(0).unmount();
    renderProbe(45);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("30 днів", 4000);
  });

  it("`null` пропускається — це «ще не порахували», а не нуль", () => {
    renderProbe(null).unmount();
    // Засіву не сталося, тож наступне справжнє значення його зробить —
    // і саме тому 7 тут НЕ святкується.
    renderProbe(7);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
