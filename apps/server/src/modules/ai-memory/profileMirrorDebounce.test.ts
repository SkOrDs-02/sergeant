import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mirrorMock } = vi.hoisted(() => ({
  mirrorMock: vi.fn<
    (pool: unknown, userId: string, profile: unknown) => Promise<unknown>
  >(async () => ({ ok: true })),
}));

vi.mock("./profileMirror.js", () => ({
  mirrorProfileMemoryEntries: mirrorMock,
}));

import type { Pool } from "pg";

import {
  PROFILE_MIRROR_DEBOUNCE_MS,
  cancelPendingProfileMirror,
  flushPendingProfileMirrors,
  scheduleProfileMemoryMirror,
} from "./profileMirrorDebounce.js";

const pool = {} as Pool;

beforeEach(() => {
  vi.useFakeTimers();
  mirrorMock.mockClear();
  mirrorMock.mockImplementation(async () => ({ ok: true }));
});

afterEach(async () => {
  await flushPendingProfileMirrors();
  vi.useRealTimers();
});

describe("scheduleProfileMemoryMirror (rel-34)", () => {
  it("серія швидких PUT одного користувача дає ОДНЕ дзеркалення фінального стану", async () => {
    scheduleProfileMemoryMirror(pool, "u1", { v: 1 });
    await vi.advanceTimersByTimeAsync(PROFILE_MIRROR_DEBOUNCE_MS - 1);
    scheduleProfileMemoryMirror(pool, "u1", { v: 2 });
    await vi.advanceTimersByTimeAsync(PROFILE_MIRROR_DEBOUNCE_MS - 1);
    scheduleProfileMemoryMirror(pool, "u1", { v: 3 });
    expect(mirrorMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PROFILE_MIRROR_DEBOUNCE_MS);
    expect(mirrorMock).toHaveBeenCalledTimes(1);
    expect(mirrorMock).toHaveBeenCalledWith(pool, "u1", { v: 3 });
  });

  it("різні користувачі не коалесуються між собою", async () => {
    scheduleProfileMemoryMirror(pool, "u1", { v: 1 });
    scheduleProfileMemoryMirror(pool, "u2", { v: 1 });
    await vi.advanceTimersByTimeAsync(PROFILE_MIRROR_DEBOUNCE_MS);
    expect(mirrorMock).toHaveBeenCalledTimes(2);
  });

  it("flush виконує відкладене одразу (graceful shutdown)", async () => {
    scheduleProfileMemoryMirror(pool, "u1", { v: 1 });
    await flushPendingProfileMirrors();
    expect(mirrorMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PROFILE_MIRROR_DEBOUNCE_MS * 2);
    expect(mirrorMock).toHaveBeenCalledTimes(1);
  });

  it("дзеркалення одного користувача не перетинаються", async () => {
    let release!: () => void;
    mirrorMock.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ ok: true }))),
    );
    scheduleProfileMemoryMirror(pool, "u1", { v: 1 });
    await vi.advanceTimersByTimeAsync(PROFILE_MIRROR_DEBOUNCE_MS);
    scheduleProfileMemoryMirror(pool, "u1", { v: 2 });
    await vi.advanceTimersByTimeAsync(PROFILE_MIRROR_DEBOUNCE_MS);
    // Друге чекає, доки перше не завершиться.
    expect(mirrorMock).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(mirrorMock).toHaveBeenCalledTimes(2);
    expect(mirrorMock).toHaveBeenLastCalledWith(pool, "u1", { v: 2 });
  });

  it("кидок усередині дзеркалення не стає unhandledRejection", async () => {
    mirrorMock.mockRejectedValueOnce(new Error("boom"));
    scheduleProfileMemoryMirror(pool, "u1", { v: 1 });
    await expect(flushPendingProfileMirrors()).resolves.toBeUndefined();
  });

  // B12 (аудит ai-pipeline-2026-08-05): відкладене дзеркалення після
  // «Очистити памʼять» повернуло б стерті факти профілю в чергу.
  it("cancel скасовує відкладене дзеркалення лише цього користувача", async () => {
    scheduleProfileMemoryMirror(pool, "u1", { v: 1 });
    scheduleProfileMemoryMirror(pool, "u2", { v: 1 });
    await cancelPendingProfileMirror("u1");
    await vi.advanceTimersByTimeAsync(PROFILE_MIRROR_DEBOUNCE_MS * 2);
    expect(mirrorMock).toHaveBeenCalledTimes(1);
    expect(mirrorMock).toHaveBeenCalledWith(pool, "u2", { v: 1 });
  });

  it("cancel дочікується дзеркалення, що вже в польоті", async () => {
    let release!: () => void;
    mirrorMock.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ ok: true }))),
    );
    scheduleProfileMemoryMirror(pool, "u1", { v: 1 });
    await vi.advanceTimersByTimeAsync(PROFILE_MIRROR_DEBOUNCE_MS);
    let done = false;
    const cancelled = cancelPendingProfileMirror("u1").then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    release();
    await cancelled;
    expect(done).toBe(true);
  });
});
