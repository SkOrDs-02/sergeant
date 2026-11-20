import { describe, expect, it } from "vitest";
import {
  shouldShowIosInstallHint,
  type IosInstallHintInput,
} from "./iosInstallHint";

const READY: IosInstallHintInput = {
  enabled: true,
  iosBrowserTab: true,
  sessions: 2,
  dismissed: false,
  inlineShownThisVisit: false,
};

describe("shouldShowIosInstallHint (О-1 (а))", () => {
  it("Safari на iPhone, друга сесія, не закрито → показати", () => {
    expect(shouldShowIosInstallHint(READY)).toBe(true);
    expect(shouldShowIosInstallHint({ ...READY, sessions: 7 })).toBe(true);
  });

  it("перша сесія → ні", () => {
    expect(shouldShowIosInstallHint({ ...READY, sessions: 1 })).toBe(false);
    expect(shouldShowIosInstallHint({ ...READY, sessions: 0 })).toBe(false);
  });

  it("не iOS або вже встановлений застосунок → ні", () => {
    expect(shouldShowIosInstallHint({ ...READY, iosBrowserTab: false })).toBe(
      false,
    );
  });

  it("закрито раніше → більше не показується", () => {
    expect(shouldShowIosInstallHint({ ...READY, dismissed: true })).toBe(false);
  });

  it("у цьому візиті вже показано під тумблером нагадувань → ні", () => {
    expect(
      shouldShowIosInstallHint({ ...READY, inlineShownThisVisit: true }),
    ).toBe(false);
  });

  it("вікно першого запису (FTUX) глушить, як і решту дзвоника → ні", () => {
    expect(shouldShowIosInstallHint({ ...READY, enabled: false })).toBe(false);
  });
});
