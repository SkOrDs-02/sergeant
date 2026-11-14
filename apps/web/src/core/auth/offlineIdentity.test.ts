// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ACCOUNT_PENDING_DELETION_CODE as SHARED_CODE } from "@sergeant/shared";
import { ApiError } from "@shared/api";
import { isAppOwnedLocalStorageKey } from "@shared/lib/storage/purgeLocalData";

import {
  ACCOUNT_PENDING_DELETION_CODE,
  LAST_ME_OK_AT_KEY,
  PENDING_DELETION_KEY,
  classifyMeFailure,
  clearOfflineAuthMarkers,
  isMeOutage,
  noteMeOk,
  notePendingDeletion,
  readLastMeOkAt,
  readPendingDeletionMarker,
} from "./offlineIdentity";

const http = (status: number, body?: unknown) =>
  new ApiError({ kind: "http", message: "x", status, body, url: "/api/v1/me" });

describe("classifyMeFailure", () => {
  it("network → offline", () => {
    const err = new ApiError({ kind: "network", message: "x", url: "/" });
    expect(classifyMeFailure(err)).toEqual({ kind: "offline" });
    expect(isMeOutage(classifyMeFailure(err).kind)).toBe(true);
  });

  it.each([
    ["503", http(503)],
    ["429", http(429)],
    ["parse", new ApiError({ kind: "parse", message: "x", url: "/" })],
    ["aborted", new ApiError({ kind: "aborted", message: "x", url: "/" })],
  ])("%s → unavailable", (_label, err) => {
    expect(classifyMeFailure(err)).toEqual({ kind: "unavailable" });
  });

  it("401 і 403 без коду → signed-out, 403 з кодом → pending-deletion", () => {
    expect(classifyMeFailure(http(401))).toEqual({ kind: "signed-out" });
    expect(classifyMeFailure(http(403, { code: "x" }))).toEqual({
      kind: "signed-out",
    });
    expect(
      classifyMeFailure(
        http(403, { code: SHARED_CODE, scheduledPurgeAt: "2026-12-01" }),
      ),
    ).toEqual({ kind: "pending-deletion", scheduledPurgeAt: "2026-12-01" });
  });
});

describe("мітки офлайн-старту", () => {
  beforeEach(() => localStorage.clear());

  it("200 пише мітку і знімає маркер видалення", () => {
    notePendingDeletion("2026-12-01");
    noteMeOk(1_000);
    expect(readLastMeOkAt()).toBe(1_000);
    expect(readPendingDeletionMarker()).toBeNull();
  });

  it("маркер видалення без дати лишається маркером", () => {
    notePendingDeletion(null);
    expect(readPendingDeletionMarker()).toBe("");
  });

  it("вихід знімає обидві", () => {
    noteMeOk(1_000);
    notePendingDeletion("2026-12-01");
    clearOfflineAuthMarkers();
    expect(readLastMeOkAt()).toBeNull();
    expect(readPendingDeletionMarker()).toBeNull();
  });
});

describe("pin літералів (AuthContext не імпортує @sergeant/shared)", () => {
  it("код 403 збігається з реєстром", () => {
    expect(ACCOUNT_PENDING_DELETION_CODE).toBe(SHARED_CODE);
  });

  it("ключі міток з префіксом auth_ і поза purge", () => {
    expect(LAST_ME_OK_AT_KEY).toBe("auth_last_me_ok_at_v1");
    expect(PENDING_DELETION_KEY).toBe("auth_pending_deletion_v1");
    expect(isAppOwnedLocalStorageKey(LAST_ME_OK_AT_KEY)).toBe(false);
    expect(isAppOwnedLocalStorageKey(PENDING_DELETION_KEY)).toBe(false);
  });
});
