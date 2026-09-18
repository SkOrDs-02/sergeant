/** @vitest-environment jsdom */
/**
 * Last validated: 2026-08-25
 * Status: Active
 *
 * AI-CONTEXT: цей хук стоїть між моделлю і незворотною зміною даних, тому
 * асерти цілять у стани, де помилка означає **виконану без згоди дію** або
 * назавжди підвислий `send()`, а не в «хук повертає обʼєкт».
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useDestructiveConfirm } from "./useDestructiveConfirm";

describe("useDestructiveConfirm", () => {
  it("до запиту діалог закритий", () => {
    const { result } = renderHook(() => useDestructiveConfirm());
    expect(result.current.pending).toBeNull();
  });

  it("request відкриває діалог і НЕ резолвиться сам по собі", async () => {
    // Найгірший можливий баг: проміс, що резолвиться `true` до того, як
    // людина щось натиснула. Виконання пішло б без згоди, а діалог
    // блимнув би постфактум.
    const { result } = renderHook(() => useDestructiveConfirm());
    const settled = vi.fn();
    act(() => {
      void result.current
        .request([{ name: "delete_transaction" }])
        .then(settled);
    });
    expect(result.current.pending?.items).toEqual([
      { name: "delete_transaction" },
    ]);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
  });

  it("accept → true, reject → false, діалог закривається", async () => {
    const { result } = renderHook(() => useDestructiveConfirm());

    let p!: Promise<boolean>;
    act(() => {
      p = result.current.request([{ name: "forget" }]);
    });
    act(() => result.current.accept());
    await expect(p).resolves.toBe(true);
    expect(result.current.pending).toBeNull();

    act(() => {
      p = result.current.request([{ name: "forget" }]);
    });
    act(() => result.current.reject());
    await expect(p).resolves.toBe(false);
    expect(result.current.pending).toBeNull();
  });

  it("повторний accept не резолвить проміс удруге", async () => {
    // Подвійний клік по «Так». Другий резолв сам по собі no-op для
    // промісу, але якби `settle` не чистив ref, наступний `request`
    // отримав би вже використаний резолвер — і його `send()` підвис би.
    const { result } = renderHook(() => useDestructiveConfirm());
    const first = vi.fn();
    act(() => {
      void result.current.request([{ name: "forget" }]).then(first);
    });
    act(() => result.current.accept());
    act(() => result.current.accept());
    await Promise.resolve();
    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith(true);

    // Наступний цикл має працювати з чистого аркуша.
    const second = vi.fn();
    act(() => {
      void result.current
        .request([{ name: "delete_transaction" }])
        .then(second);
    });
    act(() => result.current.reject());
    await Promise.resolve();
    expect(second).toHaveBeenCalledWith(false);
  });

  it("накладений request закриває попередній ВІДМОВОЮ, а не мовчки", async () => {
    // Якби `request` просто перезаписав резолвер, попередній `send()`
    // чекав би вічно — незакритий стрім, зависла кнопка. Якби він
    // резолвив `true`, виконалася б дія, якої ніхто не підтверджував.
    // Обидва варіанти гірші за відмову.
    const { result } = renderHook(() => useDestructiveConfirm());
    const stale = vi.fn();
    act(() => {
      void result.current.request([{ name: "forget" }]).then(stale);
    });
    act(() => {
      void result.current.request([{ name: "delete_transaction" }]);
    });
    await Promise.resolve();
    expect(stale).toHaveBeenCalledWith(false);
    expect(result.current.pending?.items).toEqual([
      { name: "delete_transaction" },
    ]);
  });

  it("несе весь список інструментів батчу, не лише перший", () => {
    // Діалог перелічує дії поіменно; втрата хвоста списку означала б
    // згоду на «видалити транзакцію», що насправді ще й перезаписує
    // категорії 50 інших.
    const { result } = renderHook(() => useDestructiveConfirm());
    act(() => {
      void result.current.request([
        { name: "delete_transaction" },
        { name: "batch_categorize" },
      ]);
    });
    expect(result.current.pending?.items).toEqual([
      { name: "delete_transaction" },
      { name: "batch_categorize" },
    ]);
  });

  it("несе опційний summary поряд з іменем інструмента (B39)", () => {
    // Без цього діалог погоджує людину на «batch_categorize» не показуючи
    // ні патерна, ні кількості транзакцій, які він зачепить.
    const { result } = renderHook(() => useDestructiveConfirm());
    act(() => {
      void result.current.request([
        {
          name: "batch_categorize",
          summary: "патерн «Сільпо», до 20 транзакцій",
        },
      ]);
    });
    expect(result.current.pending?.items).toEqual([
      {
        name: "batch_categorize",
        summary: "патерн «Сільпо», до 20 транзакцій",
      },
    ]);
  });
});
