// @vitest-environment jsdom
/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * A3, поставка 2 — доказ, що голос НЕ просить мікрофон в аноніма.
 *
 * Окремий файл, бо сусідня сюїта конвеєра гейт мокає (вона живе без
 * `AuthProvider`). Без цього файлу «pre-gate є» підтверджувалось би лише
 * тим, що його ніде не видно.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@shared/api", () => ({ transcribeApi: { send: vi.fn() } }));

import { useGroqVoiceInput } from "./useGroqVoiceInput";

const getUserMedia = vi.fn();

beforeEach(() => {
  getUserMedia.mockReset();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  // Запис має бути підтриманий — інакше тест пройшов би з іншої причини
  // («браузер не вміє»), а не через гейт, і нічого б не доводив.
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = class {
    static isTypeSupported = () => true;
    addEventListener() {}
    start() {}
    stop() {}
  };
});

describe("useGroqVoiceInput — pre-gate (анонім)", () => {
  it("never reaches getUserMedia without an account", async () => {
    // ЦЕ головне твердження. Дозвіл на мікрофон — це системний діалог:
    // попросити його, щоб наступним кроком відмовити 401-м, і є тією
    // «запізнілою забороною», з якої почався пункт A3.
    const onDenied = vi.fn();
    const { result } = renderHook(() => useGroqVoiceInput({ onDenied }));
    await act(async () => {
      result.current.start();
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onDenied).toHaveBeenCalledWith({ reason: "sign-in-required" });
    expect(result.current.listening).toBe(false);
  });

  it("still explains itself to callers that pass no onDenied", async () => {
    // Наявні виклики (`VoiceMicButton`) картки не рендерять. Вони мусять
    // отримати ТУ САМУ причину рядком, інакше гейт для них означав би
    // просто «кнопка нічого не робить».
    const onError = vi.fn();
    const { result } = renderHook(() => useGroqVoiceInput({ onError }));
    await act(async () => {
      result.current.start();
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Ця дія працює після входу в акаунт.");
  });
});
