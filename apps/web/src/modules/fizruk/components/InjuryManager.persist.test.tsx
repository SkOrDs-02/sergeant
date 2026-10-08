// @vitest-environment jsdom
/**
 * `InjuryManager` з РЕАЛЬНИМ `useInjuries` (на відміну від
 * `InjuryManager.test.tsx`, де `mark` змокано і гонку не видно). Мокається
 * лише межа dual-write; diff — справжній.
 *
 * Регресія аудиту 2026-10-01 (data-36): «Що болить» → кілька зон →
 * «Позначити біль» зберігало одну зону, решту dual-write одразу видаляв, а
 * тост казав «збережено».
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/sqliteWriter/index", () => ({
  triggerFizrukDualWrite: vi.fn(),
  isFizrukDualWriteRegistered: () => true,
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { triggerFizrukDualWrite } from "../lib/sqliteWriter/index";
import { diffFizrukDualWriteOps } from "../lib/sqliteWriter/diff/index";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import { __resetFizrukSqliteReadGateForTests } from "../lib/sqliteReadGate";
import { InjuryManager } from "./InjuryManager";

beforeEach(() => {
  vi.mocked(triggerFizrukDualWrite).mockClear();
  __resetFizrukSqliteReadGateForTests();
  __setFizrukSqliteCacheForTests({ injuries: [] });
});
afterEach(() => {
  cleanup();
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("InjuryManager — збереження кількох зон", () => {
  it("три зони → три активні записи, dual-write бачить три живі рядки без delete", async () => {
    render(<InjuryManager />);
    fireEvent.click(screen.getByRole("button", { name: "Коліно" }));
    fireEvent.click(screen.getByRole("button", { name: "Поперек" }));
    fireEvent.click(screen.getByRole("button", { name: "Лікоть" }));
    fireEvent.click(screen.getByRole("button", { name: "Позначити біль" }));

    // Активні зони — по кнопці «Зняти» на кожній.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Зняти" })).toHaveLength(3),
    );

    const calls = vi.mocked(triggerFizrukDualWrite).mock.calls;
    const [, lastNext] = calls.at(-1)!;
    expect(lastNext.injuries).toHaveLength(3);
    expect(lastNext.injuries.map((i) => i.site).sort()).toEqual([
      "elbow",
      "knee",
      "spine-lumbar",
    ]);
    expect(lastNext.injuries.every((i) => i.clearedAt === null)).toBe(true);

    const ops = calls.flatMap(([prev, next]) =>
      diffFizrukDualWriteOps(prev, next),
    );
    expect(ops.filter((o) => o.kind === "injury-delete")).toEqual([]);
    expect(ops.filter((o) => o.kind === "injury-upsert")).toHaveLength(3);
  });
});
