/** @vitest-environment jsdom */
/**
 * Last validated: 2026-08-01
 * Status: Active
 *
 * Фіксує два контракти хука: Back закриває відкритий аркуш, і передача
 * sheet→sheet (клік «Редагувати» закриває аркуш деталей і тим же комітом
 * відкриває аркуш редагування) не зачиняє новий аркуш.
 *
 * ⚠️ МЕЖА ЦЬОГО ТЕСТУ. У jsdom `history.back()` віддає popstate синхронно,
 * а в браузері — асинхронно, наступним тиком. Саме та різниця й важлива для
 * передачі sheet→sheet: у браузері cleanup першого аркуша встигає вистрелити
 * popstate вже ПІСЛЯ того, як другий поклав свій запис. Тобто зелений тест
 * тут НЕ доводить, що сценарій робочий у Chromium — це вміє лише
 * `tests/smoke/deep-module-crud.spec.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useHistoryDismiss } from "./useHistoryDismiss";

function Dialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useHistoryDismiss(open, onClose);
  return null;
}

/** Дає jsdom прокрутити асинхронний popstate після `history.back()`. */
async function flushPopState() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("useHistoryDismiss", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/base");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Back закриває відкритий діалог", async () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} />);

    await act(async () => {
      window.history.back();
    });
    await flushPopState();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("передача sheet→sheet не зачиняє новий аркуш", async () => {
    const closeA = vi.fn();
    const closeB = vi.fn();

    function Pair({ editing }: { editing: boolean }) {
      return (
        <>
          <Dialog open={!editing} onClose={closeA} />
          <Dialog open={editing} onClose={closeB} />
        </>
      );
    }

    const { rerender } = render(<Pair editing={false} />);
    await flushPopState();

    // Клік «Редагувати»: A закривається, B відкривається одним комітом.
    await act(async () => {
      rerender(<Pair editing />);
    });
    await flushPopState();

    expect(closeB).not.toHaveBeenCalled();
  });

  it("після передачі Back усе ще закриває новий аркуш рівно один раз", async () => {
    const closeA = vi.fn();
    const closeB = vi.fn();

    function Pair({ editing }: { editing: boolean }) {
      return (
        <>
          <Dialog open={!editing} onClose={closeA} />
          <Dialog open={editing} onClose={closeB} />
        </>
      );
    }

    const { rerender } = render(<Pair editing={false} />);
    await flushPopState();
    await act(async () => {
      rerender(<Pair editing />);
    });
    await flushPopState();

    await act(async () => {
      window.history.back();
    });
    await flushPopState();

    expect(closeB).toHaveBeenCalledTimes(1);
  });
});
