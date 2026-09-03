/**
 * Регресія з browser-QA 2026-09-02: збій показувався у звичайній бульбашці
 * асистента, з кнопкою «Озвучити», тобто нічим не відрізнявся від відповіді
 * моделі.
 */
import { describe, it, expect } from "vitest";
import { makeAssistantMsg, makeErrorMsg } from "./hubChatUtils";

describe("makeErrorMsg", () => {
  it("позначає бульбашку збою, щоб її не читали як відповідь моделі", () => {
    expect(makeErrorMsg("щось пішло не так").error).toBe(true);
  });

  it("звичайна репліка асистента лишається непозначеною", () => {
    expect(makeAssistantMsg("звичайна відповідь").error).toBeUndefined();
  });
});
