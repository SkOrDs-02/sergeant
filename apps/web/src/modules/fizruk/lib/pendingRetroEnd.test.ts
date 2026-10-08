// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * data-37 (аудит 2026-10-01): введений кінець ретро-тренування мусить
 * пережити перезапуск вкладки/PWA. iOS вивантажує PWA разом із
 * sessionStorage, і слот, що жив там, зникав: «Завершити» ставило «зараз».
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingRetroEnd,
  peekPendingRetroEnd,
  setPendingRetroEnd,
  takePendingRetroEnd,
} from "./pendingRetroEnd";

const END = "2026-09-29T19:00:00.000Z";

describe("pendingRetroEnd", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("слот переживає перезапуск вкладки (sessionStorage очищено)", () => {
    setPendingRetroEnd("w1", END);

    sessionStorage.clear(); // імітація вивантаження вкладки/PWA

    expect(peekPendingRetroEnd("w1")).toBe(END);
    expect(takePendingRetroEnd("w1")).toBe(END);
  });

  it("take споживає слот: повторне читання дає null", () => {
    setPendingRetroEnd("w1", END);
    expect(takePendingRetroEnd("w1")).toBe(END);
    expect(takePendingRetroEnd("w1")).toBeNull();
  });

  it("чужий id слот не читає і не гасить", () => {
    setPendingRetroEnd("w1", END);
    expect(takePendingRetroEnd("w2")).toBeNull();
    clearPendingRetroEnd("w2");
    expect(peekPendingRetroEnd("w1")).toBe(END);
  });

  it("clear гасить слот свого id", () => {
    setPendingRetroEnd("w1", END);
    clearPendingRetroEnd("w1");
    expect(peekPendingRetroEnd("w1")).toBeNull();
  });

  it("пошкоджений запис читається як відсутність, без кидка", () => {
    localStorage.setItem("fizruk_pending_retro_end_v1", "{not json");
    expect(peekPendingRetroEnd("w1")).toBeNull();
    expect(takePendingRetroEnd("w1")).toBeNull();
  });
});
