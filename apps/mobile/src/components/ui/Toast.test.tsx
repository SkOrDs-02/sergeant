import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native";
import { useEffect, type ReactNode } from "react";

import { ToastContainer, ToastProvider, useToast } from "./Toast";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>
  );
}

describe("Toast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("renders nothing when there are no toasts", () => {
    const { queryByText } = render(
      <ToastProvider>
        <ToastContainer />
      </ToastProvider>,
    );
    expect(queryByText(/./)).toBeNull();
  });

  it("show() adds a toast and returns a numeric id", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id: number | undefined;
    act(() => {
      id = result.current.show("Hello", "success");
    });
    expect(typeof id).toBe("number");
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]!.type).toBe("success");
  });

  it("success / error / info / warning helpers route to the right variant", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.success("s");
      result.current.error("e");
      result.current.info("i");
      result.current.warning("w");
    });
    // Видиме вікно — 3 аркуші (MAX_VISIBLE_TOASTS), тож найстаріший
    // ("success") витіснено; типи решти мають лишитись рівно тими.
    const types = result.current.toasts.map((t) => t.type).sort();
    expect(types).toEqual(["error", "info", "warning"]);
  });

  it("зберігає реальну тривалість на самому тості (прогрес-бар читає її)", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.success("s");
      result.current.error("e");
    });
    expect(result.current.toasts.map((t) => t.duration)).toEqual([3500, 5000]);
  });

  it("dismiss() removes a toast by id", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id: number | undefined;
    act(() => {
      id = result.current.show("Bye");
    });
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      result.current.dismiss(id!);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("auto-dismisses after the provided duration", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.show("tick", "info", 1000);
    });
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      jest.advanceTimersByTime(1100);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("caps the stack at 3 toasts (keeps the newest, drops the oldest)", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      for (let i = 0; i < 7; i += 1) {
        result.current.show(`t${i}`, "info", 10_000);
      }
    });
    expect(result.current.toasts).toHaveLength(3);
    const msgs = result.current.toasts.map((t) => t.msg);
    expect(msgs).toEqual(["t4", "t5", "t6"]);
  });

  it("витіснений тост не лишає живого таймера", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      for (let i = 0; i < 5; i += 1) {
        result.current.show(`t${i}`, "info", 1000);
      }
    });
    // Якби таймери витіснених жили далі, вони б смикали `dismiss` за
    // неіснуючими id і рвали список нижче.
    act(() => {
      jest.advanceTimersByTime(1100);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("useToast() throws when used outside the provider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(
      /within <ToastProvider>/,
    );
    spy.mockRestore();
  });

  function Trigger({
    onMount,
  }: {
    onMount: (api: ReturnType<typeof useToast>) => void;
  }) {
    const api = useToast();
    useEffect(() => {
      onMount(api);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  it("ToastContainer renders a string toast and the close button dismisses it", () => {
    let api: ReturnType<typeof useToast> | undefined;
    render(
      <ToastProvider>
        <ToastContainer />
        <Trigger
          onMount={(a) => {
            api = a;
            a.show("Closable", "info", 10_000);
          }}
        />
      </ToastProvider>,
    );
    expect(api).toBeDefined();
    expect(screen.getByText("Closable")).toBeTruthy();

    const close = screen.getByLabelText("Закрити");
    fireEvent.press(close);

    expect(screen.queryByText("Closable")).toBeNull();
  });

  it("action.onPress fires the callback and then dismisses the toast", () => {
    const onPress = jest.fn();
    let api: ReturnType<typeof useToast> | undefined;
    render(
      <ToastProvider>
        <ToastContainer />
        <Trigger
          onMount={(a) => {
            api = a;
            a.show("Undo-able", "info", 10_000, {
              label: "Скасувати",
              onPress,
            });
          }}
        />
      </ToastProvider>,
    );
    expect(api).toBeDefined();

    fireEvent.press(screen.getByText("Скасувати"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Undo-able")).toBeNull();
  });
});
