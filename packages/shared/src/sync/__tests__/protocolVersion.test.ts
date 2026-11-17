import { describe, expect, it } from "vitest";
import {
  SYNC_PROTOCOL_VERSION,
  parseSyncProtocolVersion,
} from "../protocolVersion";

describe("parseSyncProtocolVersion", () => {
  it("розбирає додатне ціле", () => {
    expect(parseSyncProtocolVersion("2")).toBe(2);
    expect(parseSyncProtocolVersion(" 12 ")).toBe(12);
  });

  it("сміття, нуль і не-рядок -> null", () => {
    for (const v of ["", "0", "-1", "1.5", "abc", "1e3", undefined, 3, ["2"]]) {
      expect(parseSyncProtocolVersion(v)).toBeNull();
    }
  });

  it("поточна версія валідна", () => {
    expect(parseSyncProtocolVersion(String(SYNC_PROTOCOL_VERSION))).toBe(
      SYNC_PROTOCOL_VERSION,
    );
  });
});
