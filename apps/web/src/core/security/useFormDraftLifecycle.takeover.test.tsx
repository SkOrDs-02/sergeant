// @vitest-environment jsdom
/**
 * data-45: перехоплення бази іншою вкладкою («Працювати тут»). Чернетка живої
 * форми мусить потрапити в sessionStorage ДО того, як вкладка закриє базу й
 * віддасть лок, і відновлюватись тим самим механізмом, що й після замка.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";

import { useLockDraft } from "@shared/hooks/useLockDraft";
import {
  FORM_DRAFT_IDS,
  discardAllFormDrafts,
  peekFormDraft,
  setFormDraftUser,
} from "@shared/lib/storage/formDrafts";
import {
  __resetDbOwnershipForTests,
  claimDbOwnership,
  onYieldRequested,
  readDbOwnership,
} from "../db/dbOwnership";
import { useFormDraftLifecycle } from "./useFormDraftLifecycle";

function requestLock(
  _name: string,
  _options: unknown,
  cb: (lock: object) => unknown,
): Promise<unknown> {
  return Promise.resolve(cb({}));
}

async function takeOverFromAnotherTab(): Promise<void> {
  const channel = new BroadcastChannel("sergeant-db-ownership");
  channel.postMessage({ type: "claim" });
  await vi.waitFor(() => expect(readDbOwnership()).toBe("follower"));
  channel.close();
}

describe("data-45: чернетка під час перехоплення бази", () => {
  beforeEach(() => {
    __resetDbOwnershipForTests();
    Object.defineProperty(globalThis.navigator, "locks", {
      value: { request: requestLock },
      configurable: true,
    });
  });
  afterEach(() => {
    cleanup();
    discardAllFormDrafts();
    setFormDraftUser(null);
    __resetDbOwnershipForTests();
    Object.defineProperty(globalThis.navigator, "locks", {
      value: undefined,
      configurable: true,
    });
  });

  it("зберігає незбережену форму до закриття бази і відновлює її", async () => {
    const order: string[] = [];
    onYieldRequested(async () => {
      // На момент закриття бази чернетка вже лежить у сховищі.
      order.push(
        peekFormDraft(FORM_DRAFT_IDS.routineHabit) ? "draft-saved" : "no-draft",
      );
      order.push("db-closed");
    });
    await claimDbOwnership();

    renderHook(() => {
      useFormDraftLifecycle("u1", false, false);
      useLockDraft(FORM_DRAFT_IDS.routineHabit, { name: "Біг", file: null });
    });
    setFormDraftUser("u1");

    await takeOverFromAnotherTab();

    expect(order).toEqual(["draft-saved", "db-closed"]);
    // Відновлення - тим самим peek, що й після замка.
    expect(peekFormDraft(FORM_DRAFT_IDS.routineHabit)).toEqual({
      name: "Біг",
      file: null,
    });
  });

  it("порожню форму не зберігає", async () => {
    await claimDbOwnership();
    renderHook(() => {
      useFormDraftLifecycle("u1", false, false);
      useLockDraft(FORM_DRAFT_IDS.routineHabit, null);
    });
    setFormDraftUser("u1");
    await takeOverFromAnotherTab();
    expect(peekFormDraft(FORM_DRAFT_IDS.routineHabit)).toBeNull();
  });
});
