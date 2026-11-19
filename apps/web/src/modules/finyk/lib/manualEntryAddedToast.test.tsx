/** @vitest-environment jsdom */
/**
 * «Скасувати» в тості «Витрату додано.» (журнал рішень finyk 2026-11-19).
 * Справжній провайдер і трей тостів, фейкове сховище: тест тримає і вікно
 * дії (поки тост на екрані), і шлях видалення, і провал.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import { manualLinkKey } from "@sergeant/finyk-domain/domain/debtLinkKeys";
import { showManualEntryAddedToast } from "./manualEntryAddedToast";

function renderTray(): ReturnType<typeof useToast> {
  const apiRef: { current: ReturnType<typeof useToast> | null } = {
    current: null,
  };
  function Bridge() {
    apiRef.current = useToast();
    return null;
  }
  render(
    <ToastProvider>
      <Bridge />
      <ToastContainer />
    </ToastProvider>,
  );
  if (!apiRef.current) throw new Error("toast api not mounted");
  return apiRef.current;
}

/** Сховище з одним щойно доданим записом; видалення прибирає його з масиву. */
function fakeStorage(id: string) {
  const state = { ids: [id] };
  return {
    state,
    removeManualExpense: vi.fn((rid: string) => {
      state.ids = state.ids.filter((x) => x !== rid);
      return [];
    }),
    setTxTags: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("showManualEntryAddedToast", () => {
  it("«Скасувати» прибирає саме цю витрату і її теги тим самим шляхом, що й видалення", () => {
    const toast = renderTray();
    const storage = fakeStorage("mx_1");
    act(() => {
      showManualEntryAddedToast(toast, storage, {
        id: "mx_1",
        isIncome: false,
        hasTags: true,
      });
    });
    expect(screen.getByText("Витрату додано.")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    });

    expect(storage.removeManualExpense).toHaveBeenCalledTimes(1);
    expect(storage.removeManualExpense).toHaveBeenCalledWith("mx_1");
    expect(storage.setTxTags).toHaveBeenCalledWith(manualLinkKey("mx_1"), []);
    expect(storage.state.ids).toEqual([]);
    expect(screen.queryByRole("alert", { name: /Не вдалось/ })).toBeNull();
  });

  it("без тегів не чіпає мапу тегів; надходження має свій текст", () => {
    const toast = renderTray();
    const storage = fakeStorage("mx_2");
    act(() => {
      showManualEntryAddedToast(toast, storage, {
        id: "mx_2",
        isIncome: true,
        hasTags: false,
      });
    });
    expect(screen.getByText("Надходження додано.")).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    });
    expect(storage.removeManualExpense).toHaveBeenCalledWith("mx_2");
    expect(storage.setTxTags).not.toHaveBeenCalled();
  });

  it("позначає дію як undo, щоб її знаходив Cmd/Ctrl+Z", () => {
    const show = vi.fn(() => 1);
    const toast = {
      success: show,
      error: vi.fn(() => 2),
    } as unknown as ReturnType<typeof useToast>;
    showManualEntryAddedToast(toast, fakeStorage("mx_k"), {
      id: "mx_k",
      isIncome: false,
      hasTags: false,
    });
    expect(show).toHaveBeenCalledWith(
      "Витрату додано.",
      undefined,
      expect.objectContaining({ label: "Скасувати", kind: "undo" }),
    );
  });

  it("після того, як тост зник, дії вже немає і витрата лишається", () => {
    vi.useFakeTimers();
    const toast = renderTray();
    const storage = fakeStorage("mx_3");
    act(() => {
      showManualEntryAddedToast(toast, storage, {
        id: "mx_3",
        isIncome: false,
        hasTags: false,
      });
    });
    expect(screen.getByRole("button", { name: "Скасувати" })).toBeVisible();
    // success-тост живе 3500 мс, далі 200 мс анімації виходу.
    act(() => {
      vi.advanceTimersByTime(3500 + 250);
    });
    expect(screen.queryByRole("button", { name: "Скасувати" })).toBeNull();
    expect(storage.removeManualExpense).not.toHaveBeenCalled();
    expect(storage.state.ids).toEqual(["mx_3"]);
  });

  it("провал видалення: людина бачить помилку з «Повторити», витрата лишається", () => {
    const toast = renderTray();
    const storage = fakeStorage("mx_4");
    storage.removeManualExpense.mockImplementationOnce(() => {
      throw new Error("quota");
    });
    act(() => {
      showManualEntryAddedToast(toast, storage, {
        id: "mx_4",
        isIncome: false,
        hasTags: true,
      });
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    });

    expect(
      screen.getByText("Не вдалось прибрати витрату. Спробуй ще раз."),
    ).toBeInTheDocument();
    expect(storage.state.ids).toEqual(["mx_4"]);
    // Теги не знято: запис живий, сирітських тегів немає.
    expect(storage.setTxTags).not.toHaveBeenCalled();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Повторити" }));
    });
    expect(storage.removeManualExpense).toHaveBeenCalledTimes(2);
    expect(storage.state.ids).toEqual([]);
    expect(storage.setTxTags).toHaveBeenCalledWith(manualLinkKey("mx_4"), []);
  });
});
