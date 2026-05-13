/**
 * Jest для `useSpeechRecognition`.
 *
 * `expo-speech-recognition` мокаємо повністю — інакше native модуль
 * падає в JS-only Jest runtime. Тримаємо мок мінімальним і реактивним:
 * `addListener` запам'ятовує колбеки у мапі, що дозволяє тесту
 * "вистрелити" подіями через хелпер `emit()`.
 */

type Listener = (...args: unknown[]) => void;

const mockListeners: Map<string, Set<Listener>> = new Map();

function emit(eventName: string, payload?: unknown): void {
  const set = mockListeners.get(eventName);
  if (!set) return;
  for (const fn of set) fn(payload);
}

const mockStart = jest.fn();
const mockSttStop = jest.fn();
const mockAbort = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockIsRecognitionAvailable = jest.fn();

jest.mock("expo-speech-recognition", () => {
  const addListenerImpl = (name: string, fn: Listener) => {
    let set = mockListeners.get(name);
    if (!set) {
      set = new Set();
      mockListeners.set(name, set);
    }
    set.add(fn);
    return {
      remove: () => {
        set!.delete(fn);
      },
    };
  };
  return {
    __esModule: true,
    ExpoSpeechRecognitionModule: {
      start: (...args: unknown[]) => mockStart(...args),
      stop: () => mockSttStop(),
      abort: () => mockAbort(),
      requestPermissionsAsync: () => mockRequestPermissionsAsync(),
      isRecognitionAvailable: () => mockIsRecognitionAvailable(),
      addListener: addListenerImpl,
    },
    addSpeechRecognitionListener: addListenerImpl,
  };
});

import { act, renderHook } from "@testing-library/react-native";

import { useSpeechRecognition } from "../useSpeechRecognition";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("useSpeechRecognition", () => {
  beforeEach(() => {
    mockListeners.clear();
    mockStart.mockReset();
    mockSttStop.mockReset();
    mockAbort.mockReset();
    mockRequestPermissionsAsync.mockReset();
    mockIsRecognitionAvailable.mockReset();
    mockIsRecognitionAvailable.mockReturnValue(true);
  });

  it("повертає supported=true коли native розпізнавач доступний", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(true);
    expect(result.current.listening).toBe(false);
  });

  it("повертає supported=false коли native розпізнавач не доступний", () => {
    mockIsRecognitionAvailable.mockReturnValue(false);
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(false);
  });

  it("на start() запитує permission і викликає native start з lang", async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ lang: "uk-UA", onResult }),
    );

    await act(async () => {
      result.current.start();
      await flushPromises();
    });

    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ lang: "uk-UA", interimResults: false }),
    );
  });

  it("на denied permission стрельне onError і НЕ стартує native", async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ granted: false });
    const onError = jest.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onError }));

    await act(async () => {
      result.current.start();
      await flushPromises();
    });

    expect(mockStart).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("дозволу"));
  });

  it("оновлює listening=true після native start-event", () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      emit("start");
    });

    expect(result.current.listening).toBe(true);

    act(() => {
      emit("end");
    });

    expect(result.current.listening).toBe(false);
  });

  it("викликає onResult з final transcript, ігнорує interim", () => {
    const onResult = jest.fn();
    renderHook(() => useSpeechRecognition({ onResult }));

    act(() => {
      emit("result", {
        isFinal: false,
        results: [
          { transcript: "interim text", confidence: 0.5, segments: [] },
        ],
      });
    });
    expect(onResult).not.toHaveBeenCalled();

    act(() => {
      emit("result", {
        isFinal: true,
        results: [
          { transcript: "Вівсянка з бананом", confidence: 1, segments: [] },
        ],
      });
    });
    expect(onResult).toHaveBeenCalledWith("Вівсянка з бананом");
  });

  it("on error-event перекладає known коди у UA-toast і скидає listening", () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onError }));

    act(() => {
      emit("start");
    });
    expect(result.current.listening).toBe(true);

    act(() => {
      emit("error", { error: "not-allowed", message: "denied" });
    });

    expect(result.current.listening).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("Немає дозволу"),
    );
  });

  it("ігнорує aborted-помилку (юзер сам зупинив)", () => {
    const onError = jest.fn();
    renderHook(() => useSpeechRecognition({ onError }));

    act(() => {
      emit("error", { error: "aborted", message: "aborted" });
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it("toggle() стартує коли idle і зупиняє коли listening", async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      result.current.toggle();
      await flushPromises();
    });
    expect(mockStart).toHaveBeenCalledTimes(1);

    // Симулюємо що native стрельнув start → listening=true
    act(() => {
      emit("start");
    });

    await act(async () => {
      result.current.toggle();
      await flushPromises();
    });
    expect(mockSttStop).toHaveBeenCalledTimes(1);
  });

  it("на unmount абортить native сесію", () => {
    const { unmount } = renderHook(() => useSpeechRecognition());
    unmount();
    expect(mockAbort).toHaveBeenCalled();
  });

  it("на unsupported пристрої start() стрельне onError без permission-запиту", async () => {
    mockIsRecognitionAvailable.mockReturnValue(false);
    const onError = jest.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onError }));

    await act(async () => {
      result.current.start();
      await flushPromises();
    });

    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("не підтримується"),
    );
  });
});
