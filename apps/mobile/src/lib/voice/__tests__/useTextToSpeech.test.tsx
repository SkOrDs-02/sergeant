/**
 * Jest для `useTextToSpeech`. Перевіряємо:
 *  - `speak()` дзвонить `Speech.speak` з UA-locale + lifecycle hook-ами;
 *  - `muted=true` блокує `speak()` і одразу зупиняє engine;
 *  - mute persist-ить у MMKV (через `mobileKVStore`);
 *  - empty text — no-op;
 *  - unmount → `Speech.stop`.
 */

const mockSpeak = jest.fn();
const mockSpeechStop = jest.fn();
const mockKVGet = jest.fn();
const mockKVSet = jest.fn();

jest.mock("expo-speech", () => ({
  __esModule: true,
  speak: (...args: unknown[]) => mockSpeak(...args),
  stop: () => {
    mockSpeechStop();
    return Promise.resolve();
  },
}));

jest.mock("@/lib/storage", () => ({
  __esModule: true,
  mobileKVStore: {
    getString: (...args: unknown[]) => mockKVGet(...args),
    setString: (...args: unknown[]) => mockKVSet(...args),
  },
}));

import { act, renderHook } from "@testing-library/react-native";

import { useTextToSpeech } from "../useTextToSpeech";

describe("useTextToSpeech", () => {
  beforeEach(() => {
    mockSpeak.mockReset();
    mockSpeechStop.mockReset();
    mockKVGet.mockReset();
    mockKVSet.mockReset();
    mockKVGet.mockReturnValue(null);
  });

  it("speak() дзвонить Speech.speak з UA-locale дефолтом", () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak("Привіт");
    });

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const [text, options] = mockSpeak.mock.calls[0] as [
      string,
      { language: string },
    ];
    expect(text).toBe("Привіт");
    expect(options.language).toBe("uk-UA");
  });

  it("speak() з порожнім текстом — no-op", () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak("   ");
    });

    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it("speak() — no-op коли muted", () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.setMuted(true);
    });

    act(() => {
      result.current.speak("Привіт");
    });

    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it("setMuted(true) зупиняє engine негайно та persist-ить", () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.setMuted(true);
    });

    expect(mockSpeechStop).toHaveBeenCalledTimes(1);
    expect(mockKVSet).toHaveBeenCalledWith("sergeant.voice.tts.muted", "true");
    expect(result.current.muted).toBe(true);
  });

  it("setMuted(false) persist-ить і engine не чіпає", () => {
    mockKVGet.mockReturnValue("true");
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.muted).toBe(true);

    act(() => {
      result.current.setMuted(false);
    });

    expect(result.current.muted).toBe(false);
    expect(mockKVSet).toHaveBeenCalledWith("sergeant.voice.tts.muted", "false");
  });

  it("читає persist-нутий muted з MMKV на mount", () => {
    mockKVGet.mockReturnValue("true");
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.muted).toBe(true);
  });

  it("toggleMute() перемикає стан", () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.muted).toBe(false);

    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.muted).toBe(true);

    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.muted).toBe(false);
  });

  it("speaking стає true після onStart і false після onDone", () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak("Привіт");
    });
    const options = mockSpeak.mock.calls[0]?.[1] as {
      onStart: () => void;
      onDone: () => void;
    };
    expect(options).toBeDefined();

    act(() => {
      options.onStart();
    });
    expect(result.current.speaking).toBe(true);

    act(() => {
      options.onDone();
    });
    expect(result.current.speaking).toBe(false);
  });

  it("stop() зупиняє engine і скидає speaking", () => {
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.stop();
    });

    expect(mockSpeechStop).toHaveBeenCalledTimes(1);
    expect(result.current.speaking).toBe(false);
  });

  it("на unmount зупиняє engine", () => {
    const { unmount } = renderHook(() => useTextToSpeech());
    unmount();
    expect(mockSpeechStop).toHaveBeenCalled();
  });
});
