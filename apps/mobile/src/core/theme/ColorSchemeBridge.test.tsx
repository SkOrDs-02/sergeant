/**
 * Tests for `<ColorSchemeBridge />` — the small leaf that mirrors the
 * MMKV-persisted "Темна тема" pref onto NativeWind's runtime
 * `colorScheme`. Driven entirely through the public seam
 * (`STORAGE_KEYS.HUB_PREFS` in MMKV ↔ `colorScheme.set`); no internals
 * mocked beyond the standard mobile jest setup.
 */

import { render } from "@testing-library/react-native";
import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance, safeWriteLS } from "@/lib/storage";

import { ColorSchemeBridge } from "./ColorSchemeBridge";

jest.mock("nativewind", () => {
  const set = jest.fn();
  return {
    __esModule: true,
    colorScheme: { set },
    useColorScheme: () => ({
      colorScheme: "light",
      setColorScheme: jest.fn(),
      toggleColorScheme: jest.fn(),
    }),
  };
});

// Pull the mocked `colorScheme.set` out *after* `jest.mock` has
// installed the factory above. Doing this here keeps the factory body
// self-contained (Jest forbids referencing out-of-scope variables that
// don't start with `mock` from inside a `jest.mock` factory).
import { colorScheme } from "nativewind";
const setMock = colorScheme.set as jest.Mock;

beforeEach(() => {
  setMock.mockClear();
  _getMMKVInstance().clearAll();
});

describe("ColorSchemeBridge", () => {
  it('resolves to "system" when darkMode is unset', () => {
    render(<ColorSchemeBridge />);
    expect(setMock).toHaveBeenLastCalledWith("system");
  });

  it('resolves to "dark" when darkMode === true', () => {
    safeWriteLS(STORAGE_KEYS.HUB_PREFS, { darkMode: true });
    render(<ColorSchemeBridge />);
    expect(setMock).toHaveBeenLastCalledWith("dark");
  });

  it('resolves to "light" when darkMode === false', () => {
    safeWriteLS(STORAGE_KEYS.HUB_PREFS, { darkMode: false });
    render(<ColorSchemeBridge />);
    expect(setMock).toHaveBeenLastCalledWith("light");
  });

  it("preserves unrelated HubPrefs fields (showCoach, showHints) through the bridge", () => {
    safeWriteLS(STORAGE_KEYS.HUB_PREFS, {
      darkMode: true,
      showCoach: false,
      showHints: false,
    });
    render(<ColorSchemeBridge />);
    expect(setMock).toHaveBeenLastCalledWith("dark");
    // Bridge must not stomp on the persisted pref blob.
    const raw = _getMMKVInstance().getString(STORAGE_KEYS.HUB_PREFS);
    expect(raw && JSON.parse(raw)).toMatchObject({
      darkMode: true,
      showCoach: false,
      showHints: false,
    });
  });

  it("renders no DOM/native nodes (returns null)", () => {
    const { toJSON } = render(<ColorSchemeBridge />);
    expect(toJSON()).toBeNull();
  });

  it("does nothing dangerous when MMKV holds a non-object payload", () => {
    // safeReadLS falls back to the default `{}` on JSON parse failure,
    // so a corrupted slice should not throw — bridge stays in "system".
    _getMMKVInstance().set(STORAGE_KEYS.HUB_PREFS, "not-json");
    expect(() => render(<ColorSchemeBridge />)).not.toThrow();
    expect(setMock).toHaveBeenLastCalledWith("system");
  });
});
