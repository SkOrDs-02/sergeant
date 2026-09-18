// @vitest-environment jsdom
/**
 * Тести `useDecimalDraft` — контрольоване десяткове поле, яке не гасить
 * незавершений ввід. Ключовий кейс тут той самий, що й у багу бета-тестера
 * 2026-08-10: посимвольний набір «82,5» має дати `82.5`, а не `825` і не `0`.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDecimalDraft } from "./useDecimalDraft";

const MAX = 1000;

/** Друкує рядок посимвольно, як це робить людина в реальному полі. */
function type(
  result: { current: ReturnType<typeof useDecimalDraft> },
  input: string,
): void {
  for (let i = 1; i <= input.length; i += 1) {
    const value = input.slice(0, i);
    act(() => {
      result.current.onChange({
        target: { value },
      } as React.ChangeEvent<HTMLInputElement>);
    });
  }
}

describe("useDecimalDraft", () => {
  it("посимвольний набір «82,5» доживає до коміту цілим", () => {
    // Регресія на корінь бага: клемп на кожному натисканні перетворював
    // «82,» на 82, кома зникала з поля, і наступна цифра давала 825.
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDecimalDraft("", MAX, onCommit));

    type(result, "82,5");

    expect(result.current.value).toBe("82,5");
    expect(onCommit).toHaveBeenLastCalledWith(82.5);
  });

  it("те саме з крапкою — обидва роздільники рівноправні", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDecimalDraft("", MAX, onCommit));

    type(result, "82.5");

    expect(result.current.value).toBe("82.5");
    expect(onCommit).toHaveBeenLastCalledWith(82.5);
  });

  it("порожнє поле комітить null, а не 0 — інакше його не очистити", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDecimalDraft(82.5, MAX, onCommit));

    act(() => {
      result.current.onChange({
        target: { value: "" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.value).toBe("");
    expect(onCommit).toHaveBeenLastCalledWith(null);
  });

  it("стеля лишається видимою: у полі зʼявляється max, а не надрукований ввід", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDecimalDraft("", MAX, onCommit));

    act(() => {
      result.current.onChange({
        target: { value: "99999999" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.value).toBe(String(MAX));
    expect(onCommit).toHaveBeenLastCalledWith(MAX);
  });

  it("ігнорує символи, з яких десяткове не складається", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDecimalDraft("", MAX, onCommit));

    type(result, "82");
    onCommit.mockClear();

    for (const bad of ["82a", "82-", "82e5"]) {
      act(() => {
        result.current.onChange({
          target: { value: bad },
        } as React.ChangeEvent<HTMLInputElement>);
      });
    }

    expect(result.current.value).toBe("82");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("зовнішня зміна значення переписує чернетку", () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ committed }) => useDecimalDraft(committed, MAX, onCommit),
      { initialProps: { committed: 10 as number | string } },
    );

    type(result, "82,5");
    rerender({ committed: 40 });

    expect(result.current.value).toBe("40");
  });

  it("власне відлуння чернетку НЕ переписує — інакше кома гасне на кожному натисканні", () => {
    // Реальний цикл: onCommit піднімає число у стан батька, воно вертається
    // сюди пропом. «82,» і 82 — те саме число, тож чернетку чіпати не можна.
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ committed }) => useDecimalDraft(committed, MAX, onCommit),
      { initialProps: { committed: "" as number | string } },
    );

    type(result, "82,");
    rerender({ committed: 82 });

    expect(result.current.value).toBe("82,");
  });
});

describe("useDecimalDraft — { group: true }", () => {
  const GROUP_MAX = 10_000_000;

  /**
   * Групування працює з реальним елементом: воно править `value` і каретку
   * на місці, тож фейкового `{ target: { value } }` тут замало.
   */
  function typeInto(
    result: { current: ReturnType<typeof useDecimalDraft> },
    el: HTMLInputElement,
    input: string,
  ): void {
    for (const char of input) {
      el.value += char;
      el.setSelectionRange(el.value.length, el.value.length);
      act(() => {
        result.current.onChange({
          target: el,
          currentTarget: el,
        } as unknown as React.ChangeEvent<HTMLInputElement>);
      });
    }
  }

  it("розставляє роздільники під час набору, а число комітить без них", () => {
    const onCommit = vi.fn();
    const el = document.createElement("input");
    const { result } = renderHook(() =>
      useDecimalDraft("", GROUP_MAX, onCommit, { group: true }),
    );

    typeInto(result, el, "80000");

    expect(result.current.value).toBe("80\u00a0000");
    expect(el.value).toBe("80\u00a0000");
    expect(onCommit).toHaveBeenLastCalledWith(80000);
  });

  it("не ламає незавершену кому — той самий інваріант, що й без групування", () => {
    const onCommit = vi.fn();
    const el = document.createElement("input");
    const { result } = renderHook(() =>
      useDecimalDraft("", GROUP_MAX, onCommit, { group: true }),
    );

    typeInto(result, el, "1200,");

    expect(result.current.value).toBe("1\u00a0200,");
    expect(onCommit).toHaveBeenLastCalledWith(1200);
  });

  it("підвантажене ззовні значення показується вже згрупованим", () => {
    const { result } = renderHook(() =>
      useDecimalDraft(1234567, GROUP_MAX, vi.fn(), { group: true }),
    );

    expect(result.current.value).toBe("1\u00a0234\u00a0567");
  });

  it("без опції поведінка лишається старою — грами й вага не групуються", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useDecimalDraft("", GROUP_MAX, onCommit),
    );

    type(result, "1200");

    expect(result.current.value).toBe("1200");
  });
});
