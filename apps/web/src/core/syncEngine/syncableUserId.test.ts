/** @vitest-environment jsdom */
// jsdom потрібен лише тут: пін імпортує `useLocalUserId`, а той тягне
// `AuthContext` → `authClient`, який читає `window.location`. Саме тому
// сам `syncableUserId.ts` цих імпортів не має — він сидить на write-path.
import { describe, expect, it } from "vitest";

import { DEMO_LOCAL_USER_ID } from "../onboarding/onboardingGate";
import { LOCAL_ANON_USER_ID } from "../auth/useLocalUserId";

import { isSyncableUserId, NON_SYNCABLE_USER_IDS } from "./syncableUserId.js";

describe("isSyncableUserId", () => {
  it("пінить синтетичні id — новий локальний id не проскочить у чергу", () => {
    // Робить неможливим дрейф: `syncableUserId.ts` навмисно НЕ імпортує
    // ці константи (React/AuthContext на write-path — див. коментар там),
    // тож єдине, що тримає списки в синхроні, — цей асерт. Порівнюємо
    // МНОЖИНИ, а не довжини: збіг довжин нічого не доводить.
    expect(new Set(NON_SYNCABLE_USER_IDS)).toEqual(
      new Set([LOCAL_ANON_USER_ID, DEMO_LOCAL_USER_ID]),
    );
  });

  it("відсікає анонімний і демо id", () => {
    expect(isSyncableUserId(LOCAL_ANON_USER_ID)).toBe(false);
    expect(isSyncableUserId(DEMO_LOCAL_USER_ID)).toBe(false);
  });

  it("відсікає порожній id", () => {
    expect(isSyncableUserId("")).toBe(false);
  });

  it("пропускає справжній Better Auth id", () => {
    expect(isSyncableUserId("usr_9f3c1a2b4d5e")).toBe(true);
  });
});
