import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STORAGE_KEYS } from "@sergeant/shared";

/**
 * `AuthContext` hardcodes the origin-device-id storage key instead of
 * importing `STORAGE_KEYS`: pulling `@sergeant/shared` in there (statically
 * or dynamically) re-chunks the eager graph badly enough that the analytics
 * module boots with uninitialised constants and the app white-screens.
 * This pins the literal to the registry so a future rename cannot silently
 * strand the logout reset — see the comment at the constant.
 */
describe("AuthContext origin-device-id key", () => {
  it("matches the STORAGE_KEYS registry value", () => {
    const source = readFileSync(
      new URL("./AuthContext.tsx", import.meta.url),
      "utf8",
    );
    const match = source.match(/const SYNC_ORIGIN_DEVICE_ID_KEY = "([^"]+)"/);
    expect(match?.[1]).toBe(STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID);
  });
});
