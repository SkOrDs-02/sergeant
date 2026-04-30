/* eslint-env node, jest */
// Jest global setup for the mobile app. Registers mocks for native
// modules that can't run in the jest-expo JSDOM-like environment:
//
//   - react-native-mmkv: replaced by an in-memory shim so storage
//     helpers (`safeReadLS`, `safeWriteLS`, …) work without a native
//     TurboModule being loaded.
//   - @react-native-community/netinfo: replaced by a stub whose
//     subscription callback can be driven from tests that need to
//     simulate offline → online transitions.
//   - react-native-gesture-handler: pulls in the RNGH-provided jest
//     setup so that tests relying on `Gesture.*().withTestId()` +
//     `fireGestureHandler` (see `DraggableHabitList.test.tsx`) can run
//     without a real TurboModule. Harmless for tests that don't use
//     gestures — the setup only swaps RNGH's native module for a mock.

require("react-native-gesture-handler/jestSetup");

// `@react-native-async-storage/async-storage` ships a hand-rolled
// CommonJS mock — register it here so any component that reads/writes
// persisted UI state (e.g. the collapsible Body trend cards) works in
// tests without pulling in the real TurboModule.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// `@/auth/authClient` re-exports Better Auth's React client, which is
// shipped as an ESM-only bundle. jest-expo's default transform list
// does not include `better-auth/*`, so any test that indirectly
// imports the auth client blows up with "Cannot use import statement
// outside a module". Tests that care about sign-out / session state
// mock this module explicitly; the default stub below just keeps
// render-smoke tests (e.g. `HubSettingsPage.test.tsx`) green when
// they sweep a screen that contains `AccountSection`.
jest.mock("@/auth/authClient", () => {
  const signIn = {
    email: jest.fn(() => Promise.resolve({ data: null, error: null })),
  };
  const signUp = {
    email: jest.fn(() => Promise.resolve({ data: null, error: null })),
  };
  const signOut = jest.fn(() => Promise.resolve());
  const getSession = jest.fn(() =>
    Promise.resolve({ data: null, error: null }),
  );
  return {
    __esModule: true,
    signIn,
    signUp,
    signOut,
    getSession,
    authClient: { signIn, signUp, signOut, getSession },
  };
});

// `react-native-safe-area-context` reads device insets via a native
// TurboModule that isn't loaded in the jest-expo runtime. Without a
// SafeAreaProvider mounted at the root of every render tree, every
// component calling `useSafeAreaInsets()` (Sheet, Toast, every screen
// under apps/mobile/src/modules/**, …) crashes with:
//   "No safe area value available. Make sure you are rendering
//    <SafeAreaProvider> at the top of your app."
//
// Several test files already register an identical mock locally; this
// setup-level mock is a superset so new tests don't have to remember
// the boilerplate (and the per-file mocks remain valid because Jest
// hoists `jest.mock` calls and lets the file-level one take precedence).
//
// Insets default to `{0,0,0,0}` — render-tests rarely care about exact
// pixel offsets; the few that do can override the mock with their own
// `jest.mock(..., () => ({ useSafeAreaInsets: () => ({ top: 47, ... }) }))`.
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  const React = require("react");
  const Passthrough = ({ children }) =>
    React.createElement(React.Fragment, null, children);
  return {
    __esModule: true,
    SafeAreaProvider: Passthrough,
    SafeAreaConsumer: ({ children }) =>
      typeof children === "function"
        ? children({ top: 0, bottom: 0, left: 0, right: 0 })
        : children,
    SafeAreaView: RN.View,
    SafeAreaInsetsContext: {
      Consumer: ({ children }) =>
        typeof children === "function"
          ? children({ top: 0, bottom: 0, left: 0, right: 0 })
          : children,
      Provider: Passthrough,
    },
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
    initialWindowMetrics: {
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
    },
  };
});

jest.mock("react-native-mmkv", () => {
  class MMKV {
    constructor() {
      this._store = new Map();
    }
    set(key, value) {
      this._store.set(key, String(value));
    }
    getString(key) {
      return this._store.has(key) ? this._store.get(key) : undefined;
    }
    getNumber(key) {
      const v = this._store.get(key);
      return v === undefined ? undefined : Number(v);
    }
    getBoolean(key) {
      const v = this._store.get(key);
      if (v === undefined) return undefined;
      return v === "true";
    }
    contains(key) {
      return this._store.has(key);
    }
    delete(key) {
      this._store.delete(key);
    }
    clearAll() {
      this._store.clear();
    }
    getAllKeys() {
      return Array.from(this._store.keys());
    }
    addOnValueChangedListener() {
      return { remove: () => {} };
    }
  }
  return { MMKV };
});

// expo-router pulls in `@react-native-navigation/native` whose ESM entry
// is not transformed by jest-expo's default transform list. Tests that
// import from `expo-router` only care about the imperative API, so a
// minimal mock (`router.replace` / `router.push` / `router.back`) is
// enough for render-tests. Add fields here as tests start needing them.
jest.mock("expo-router", () => ({
  __esModule: true,
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
  },
  Link: "Link",
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSearchParams: () => ({}),
  usePathname: () => "/",
  useSegments: () => [],
  Redirect: () => null,
  Stack: Object.assign(() => null, {
    Screen: () => null,
  }),
  Tabs: Object.assign(() => null, {
    Screen: () => null,
  }),
}));

jest.mock("@react-native-community/netinfo", () => {
  const listeners = new Set();
  let current = {
    isConnected: true,
    isInternetReachable: true,
    type: "wifi",
  };
  return {
    __esModule: true,
    default: {
      fetch: jest.fn(() => Promise.resolve(current)),
      addEventListener: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      // Test helpers — not part of the real NetInfo API.
      __setState: (next) => {
        current = { ...current, ...next };
        for (const cb of listeners) cb(current);
      },
      __reset: () => {
        listeners.clear();
        current = {
          isConnected: true,
          isInternetReachable: true,
          type: "wifi",
        };
      },
    },
  };
});
