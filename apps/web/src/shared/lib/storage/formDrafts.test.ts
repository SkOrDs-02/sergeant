// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STASH_COMMIT_WINDOW_MS,
  clearFormDraft,
  commitStashedFormDrafts,
  discardAllFormDrafts,
  discardFormDraftsExcept,
  peekFormDraft,
  setFormDraftUser,
  stashFormDraft,
} from "./formDrafts";
import { safeListSSKeys } from "@shared/lib/storage/storage";
import { purgeAppOwnedSessionStorage } from "@shared/lib/storage/purgeLocalData";

const keys = () => safeListSSKeys().filter((k) => k.includes("formDraft"));

describe("formDrafts", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    discardAllFormDrafts();
    setFormDraftUser("u1");
  });
  afterEach(() => vi.useRealTimers());

  it("знімок потрапляє у сховище лише при коміті замка, а читання не стирає його", () => {
    stashFormDraft("f", { a: 1 });
    expect(keys()).toHaveLength(0);

    expect(commitStashedFormDrafts("u1")).toBe(1);
    expect(peekFormDraft("f")).toEqual({ a: 1 });
    expect(peekFormDraft("f")).toEqual({ a: 1 });

    clearFormDraft("f");
    expect(peekFormDraft("f")).toBeNull();
  });

  it("знімок із давнього розмонтування (навігація) замок не підхоплює", () => {
    vi.useFakeTimers();
    stashFormDraft("f", { a: 1 });
    vi.advanceTimersByTime(STASH_COMMIT_WINDOW_MS + 1);

    expect(commitStashedFormDrafts("u1")).toBe(0);
    expect(peekFormDraft("f")).toBeNull();
  });

  it("чернетка прив'язана до користувача: інший користувач її не бачить", () => {
    stashFormDraft("f", { a: 1 });
    commitStashedFormDrafts("u1");

    setFormDraftUser("u2");
    expect(peekFormDraft("f")).toBeNull();

    setFormDraftUser("u1");
    expect(peekFormDraft("f")).toEqual({ a: 1 });
  });

  it("зміна користувача стирає чужі чернетки, але не власні", () => {
    stashFormDraft("f", 1);
    commitStashedFormDrafts("u1");
    stashFormDraft("g", 2);
    commitStashedFormDrafts("u2");
    expect(keys()).toHaveLength(2);

    expect(discardFormDraftsExcept("u2")).toBe(1);
    setFormDraftUser("u2");
    expect(peekFormDraft("g")).toBe(2);
    setFormDraftUser("u1");
    expect(peekFormDraft("f")).toBeNull();
  });

  it("id користувача з крапкою не збігається з префіксом іншого користувача", () => {
    stashFormDraft("f", 1);
    commitStashedFormDrafts("a.b");
    expect(discardFormDraftsExcept("a")).toBe(1);
  });

  it("зіпсований або прострочений запис стирається при читанні", () => {
    stashFormDraft("f", 1);
    commitStashedFormDrafts("u1");
    const [key] = keys();
    window.sessionStorage.setItem(key!, "{not json");
    expect(peekFormDraft("f")).toBeNull();
    expect(keys()).toHaveLength(0);

    window.sessionStorage.setItem(
      key!,
      JSON.stringify({ savedAt: Date.now() - 13 * 3600_000, data: 1 }),
    );
    expect(peekFormDraft("f")).toBeNull();
    expect(keys()).toHaveLength(0);
  });

  it("вихід з акаунта (purgeAppOwnedSessionStorage) стирає чернетки: ключі мають app-префікс", () => {
    stashFormDraft("f", 1);
    commitStashedFormDrafts("u1");
    expect(keys()).toHaveLength(1);

    purgeAppOwnedSessionStorage();

    expect(keys()).toHaveLength(0);
  });
});
