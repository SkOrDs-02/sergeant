/** @vitest-environment jsdom */
/**
 * priv-03: холодний старт з уже налаштованим PIN-ом. Прапорець
 * `app-lock-enabled` на першому рендері читається з порожнього localStorage
 * (SQLite kv ще не піднято) і хибно `false` — екран PIN усе одно має
 * з'явитись, а до цього дані закриті завісою. Провайдер і `AppLock` реальні,
 * зібрані так само, як у `RootLayout`; прапорці — реальний `featureFlags`
 * (без моків), тобто прапорець справді `false`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";

vi.mock("../observability/posthog", () => ({ capturePostHogEvent: vi.fn() }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: null, status: "unauthenticated" }),
}));

import { getFlag } from "../lib/featureFlags";
import { AppLock } from "./AppLock";
import { AppLockProvider, useAppLockContext } from "./AppLockContext";
import { clearPinHash, savePinHash } from "./lockStorage";

function Shell() {
  const appLock = useAppLockContext();
  return (
    <>
      <AppLock
        state={appLock.state}
        onUnlock={appLock.unlock}
        onSavePin={appLock.savePin}
        onSetupDone={appLock.finishSetup}
        onSetupCancel={appLock.finishSetup}
        onChangeCancel={appLock.finishSetup}
      />
      <main data-testid="app-data">app data</main>
    </>
  );
}

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

describe("AppLock: холодний старт після перезавантаження (priv-03)", () => {
  beforeEach(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
  });

  afterEach(async () => {
    cleanup();
    await clearPinHash().catch(() => {});
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  });

  it("показує екран «Введи PIN», хоча прапорець app-lock-enabled читається як false", async () => {
    await savePinHash("1234");
    expect(getFlag("app-lock-enabled")).toBe(false);

    render(
      <AppLockProvider>
        <Shell />
      </AppLockProvider>,
    );

    // Спершу — завіса (дані не видно), потім — екран PIN.
    expect(screen.getByTestId("app-lock-checking")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Введи PIN")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("app-lock-checking")).not.toBeInTheDocument();
  });

  it("без PIN завіса знімається і блокування не з'являється", async () => {
    render(
      <AppLockProvider>
        <Shell />
      </AppLockProvider>,
    );
    expect(screen.getByTestId("app-lock-checking")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("app-lock-checking")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Введи PIN")).not.toBeInTheDocument();
  });
});
