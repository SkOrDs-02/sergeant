/**
 * Status: Active
 *
 * Збирач write-підтверджень чат-батча (rel-16): спільний для routine і finyk.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureChatWrites,
  CHAT_WRITE_CONFIRM_TIMEOUT_MS,
  combineChatWrites,
  isCapturingChatWrites,
  trackChatWrite,
  withChatWriteConfirm,
} from "./chatWrites";

afterEach(() => {
  vi.useRealTimers();
});

describe("captureChatWrites / trackChatWrite", () => {
  it("збирає лише записи всередині run()", () => {
    trackChatWrite(Promise.resolve(false)); // поза батчем - ігнорується
    const { writes } = captureChatWrites(() => {
      expect(isCapturingChatWrites()).toBe(true);
      trackChatWrite(Promise.resolve(true));
    });
    expect(writes).toHaveLength(1);
    expect(isCapturingChatWrites()).toBe(false);
  });

  it("вкладений збирач не краде записи зовнішнього", () => {
    const outer = captureChatWrites(() => {
      trackChatWrite(Promise.resolve(true));
      const inner = captureChatWrites(() => {
        trackChatWrite(Promise.resolve(true));
      });
      expect(inner.writes).toHaveLength(1);
      trackChatWrite(Promise.resolve(true));
    });
    expect(outer.writes).toHaveLength(2);
  });
});

describe("combineChatWrites", () => {
  it("true, лише коли ВСІ записи лягли", async () => {
    await expect(
      combineChatWrites([Promise.resolve(true), Promise.resolve(true)]),
    ).resolves.toBe(true);
    await expect(
      combineChatWrites([Promise.resolve(true), Promise.resolve(false)]),
    ).resolves.toBe(false);
  });

  it("відхилений промис = false, не кидає", async () => {
    await expect(
      combineChatWrites([Promise.reject(new Error("boom"))]),
    ).resolves.toBe(false);
  });

  it("завислий запис = false після тайм-ауту", async () => {
    vi.useFakeTimers();
    const run = combineChatWrites([new Promise<boolean>(() => {})]);
    await vi.advanceTimersByTimeAsync(CHAT_WRITE_CONFIRM_TIMEOUT_MS);
    await expect(run).resolves.toBe(false);
  });
});

describe("withChatWriteConfirm", () => {
  it("без записів віддає результат як є", () => {
    expect(withChatWriteConfirm(() => "ok")).toBe("ok");
  });

  it("рядок із записом -> обʼєкт із confirm", async () => {
    const out = withChatWriteConfirm(() => {
      trackChatWrite(Promise.resolve(false));
      return "готово";
    });
    expect(typeof out).toBe("object");
    if (typeof out === "string") return;
    expect(out.result).toBe("готово");
    await expect(out.confirm).resolves.toBe(false);
  });

  it("зберігає undo і додає confirm", async () => {
    const undo = vi.fn();
    const out = withChatWriteConfirm(() => {
      trackChatWrite(Promise.resolve(true));
      return { result: "r", undo };
    });
    if (typeof out === "string") throw new Error("expected object");
    expect(out.undo).toBe(undo);
    await expect(out.confirm).resolves.toBe(true);
  });
});
