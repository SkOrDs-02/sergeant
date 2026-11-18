// @vitest-environment jsdom
/**
 * PR-F7 (аудит 2026-09-13, хвиля 7 2026-11-18): три поверхні одного enum
 * `syncState.status` мусять говорити одним словником. Шапка модуля
 * (`getSyncTone` → `SyncPill`) і рядок над Операціями (`TransactionSyncPill`)
 * беруть регістр `short`, бейдж Огляду (`SyncStatusBadge`) — `full`.
 * До хвилі 7 кожна мала власну мапу, і шапка казала «оновлення», а
 * Операції «оновлення…»; цей тест падає, щойно одна з поверхонь знову
 * заведе свій рядок.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getSyncTone } from "./SyncIndicator";
import { SyncStatusBadge } from "./SyncStatusBadge";
import { TransactionSyncPill } from "../pages/transactions/TransactionSyncPill";
import { SYNC_STATUS_LABELS } from "../lib/syncStatusLabels";

const NOT_OK = ["loading", "partial", "error"] as const;

afterEach(cleanup);

describe("стан синку Фініка: один словник на три поверхні (PR-F7)", () => {
  it.each(NOT_OK)("шапка і рядок Операцій кажуть те саме для %s", (status) => {
    const header = getSyncTone({ status }).text;
    render(
      <TransactionSyncPill
        syncState={{
          status,
          source: "network",
          accountsOk: 1,
          accountsTotal: 1,
        }}
        lastUpdated={null}
      />,
    );
    expect(header).toBe(SYNC_STATUS_LABELS.short[status]);
    expect(screen.getByText(header)).toBeInTheDocument();
  });

  it("зелений стан шапки зветься так само, як спалах над Операціями", () => {
    expect(getSyncTone({ status: "success" }).text).toBe(
      SYNC_STATUS_LABELS.short.success,
    );
  });

  it.each(NOT_OK)("бейдж Огляду бере повний регістр для %s", (status) => {
    render(<SyncStatusBadge syncState={{ status }} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      SYNC_STATUS_LABELS.full[status],
    );
  });

  it("обидва регістри покривають однаковий набір статусів", () => {
    expect(Object.keys(SYNC_STATUS_LABELS.full).sort()).toEqual(
      Object.keys(SYNC_STATUS_LABELS.short).sort(),
    );
  });
});
