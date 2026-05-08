import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./msw/server";
import { afterAll, afterEach, beforeAll } from "vitest";

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
}

function hasStorageShape(value: unknown): value is Storage {
  if (!value || typeof value !== "object") return false;
  const storage = value as Partial<Storage>;
  return (
    typeof storage.getItem === "function" &&
    typeof storage.setItem === "function" &&
    typeof storage.removeItem === "function" &&
    typeof storage.clear === "function" &&
    typeof storage.key === "function" &&
    typeof storage.length === "number"
  );
}

function ensureTestLocalStorage(): void {
  if (hasStorageShape(globalThis.localStorage)) return;
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(
      globalThis,
      "localStorage",
      originalLocalStorageDescriptor,
    );
    if (hasStorageShape(globalThis.localStorage)) return;
  }
  Object.defineProperty(globalThis, "localStorage", {
    value: createMemoryStorage(),
    configurable: true,
  });
}

beforeAll(() => ensureTestLocalStorage());
afterEach(() => ensureTestLocalStorage());

// `@testing-library/react` only auto-cleans when `globals: true` is set in
// vitest config; this monorepo opts out of globals (see
// `apps/web/vitest.config.js`), so the auto-hook never installs and DOM
// nodes from the previous test leak into the next one — which made
// `WhatsNewModal.test.tsx` fail with "Found multiple elements with the
// role 'button' and name 'Спробувати'" once the third test rendered into
// a DOM that already contained two prior modal copies. Hooking
// `cleanup()` here mirrors the standard testing-library setup pattern.
afterEach(() => cleanup());

// Wire MSW lifecycle: intercept outgoing requests in all test suites.
// Per-test overrides via `server.use(...)` are reset after each test.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
