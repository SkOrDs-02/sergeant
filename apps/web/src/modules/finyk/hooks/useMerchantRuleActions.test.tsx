// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ToastApi } from "@shared/hooks/useToast";
import type { MerchantRule } from "@sergeant/finyk-domain/lib/merchantRules";
import { MERCHANT_RULES_LIMIT } from "@sergeant/finyk-domain/lib/merchantRules";
import { useFinykMerchantRules } from "./useFinykMerchantRules";
import { useMerchantRuleActions } from "./useMerchantRuleActions";

function makeToast() {
  const show = vi.fn(() => 1);
  const error = vi.fn(() => 2);
  const warning = vi.fn(() => 5);
  const toast = {
    show,
    error,
    success: vi.fn(() => 3),
    info: vi.fn(() => 4),
    warning,
    dismiss: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  } as unknown as ToastApi;
  return { toast, show, error, warning };
}

function useHarness(
  toast: ToastApi,
  initial: MerchantRule[] = [],
  customCategories: readonly unknown[] = [],
) {
  const [merchantRules, setMerchantRules] = useState<MerchantRule[]>(initial);
  const api = useFinykMerchantRules({ merchantRules, setMerchantRules });
  const actions = useMerchantRuleActions({
    upsertMerchantRule: api.upsertMerchantRule,
    undoMerchantRule: api.undoMerchantRule,
    deleteMerchantRule: api.deleteMerchantRule,
    restoreMerchantRules: api.restoreMerchantRules,
    customCategories,
    toast,
  });
  return { api, actions };
}

const SILPO = { id: "t1", description: "Сільпо №12", amount: -25000 };

/** Дістає action останнього `toast.show(msg, type, duration, action)`. */
function lastAction(show: ReturnType<typeof makeToast>["show"]) {
  const call = show.mock.calls.at(-1) as unknown as [
    string,
    string,
    number,
    { label: string; kind?: string; onClick: () => void },
  ];
  return { msg: call[0], action: call[3] };
}

describe("useMerchantRuleActions", () => {
  it("створює правило й показує тост із відкатом (kind: undo)", () => {
    const { toast, show } = makeToast();
    const { result } = renderHook(() => useHarness(toast));

    let ok = false;
    act(() => {
      ok = result.current.actions.createRule(SILPO, "transport");
    });

    expect(ok).toBe(true);
    expect(result.current.api.merchantRules).toHaveLength(1);
    expect(result.current.api.merchantRules[0]).toMatchObject({
      kind: "expense",
      merchantKey: "сільпо",
      categoryId: "transport",
      label: "Сільпо №12",
    });
    const { msg, action } = lastAction(show);
    expect(msg).toBe("Правило збережено: «Сільпо №12» тепер у «Транспорт»");
    expect(action.kind).toBe("undo");
    expect(action.label).toBe("Скасувати");
  });

  it("відкат із тосту прибирає щойно створене правило", () => {
    const { toast, show } = makeToast();
    const { result } = renderHook(() => useHarness(toast));
    act(() => {
      result.current.actions.createRule(SILPO, "transport");
    });

    act(() => lastAction(show).action.onClick());

    expect(result.current.api.merchantRules).toEqual([]);
  });

  it("повторне створення для того ж мерчанта оновлює правило, а відкат повертає старе", () => {
    const { toast, show } = makeToast();
    const { result } = renderHook(() => useHarness(toast));
    act(() => {
      result.current.actions.createRule(SILPO, "transport");
    });
    const first = result.current.api.merchantRules[0]!;

    act(() => {
      result.current.actions.createRule(
        { ...SILPO, description: "СІЛЬПО 45" },
        "food",
      );
    });
    expect(result.current.api.merchantRules).toHaveLength(1);
    expect(result.current.api.merchantRules[0]).toMatchObject({
      id: first.id,
      categoryId: "food",
    });
    expect(lastAction(show).msg).toMatch(/^Правило оновлено/);

    act(() => lastAction(show).action.onClick());
    expect(result.current.api.merchantRules).toEqual([first]);
  });

  it("надходження дістає окреме правило (kind: income)", () => {
    const { toast } = makeToast();
    const { result } = renderHook(() => useHarness(toast));
    act(() => {
      result.current.actions.createRule(
        { id: "t2", description: "Іван Петренко", amount: 50000 },
        "salary",
      );
    });
    expect(result.current.api.merchantRules[0]).toMatchObject({
      kind: "income",
      categoryId: "salary",
    });
  });

  it("порожній ключ або нуль у сумі: нічого не створює й не показує тост", () => {
    const { toast, show, error, warning } = makeToast();
    const { result } = renderHook(() => useHarness(toast));
    let ok = true;
    act(() => {
      ok = result.current.actions.createRule(
        { id: "t3", description: "1234", amount: -100 },
        "food",
      );
    });
    expect(ok).toBe(false);
    expect(result.current.api.merchantRules).toEqual([]);
    expect(show).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it("на ліміті правил відмовляє з поясненням, що робити далі", () => {
    const { toast, warning } = makeToast();
    const full: MerchantRule[] = Array.from(
      { length: MERCHANT_RULES_LIMIT },
      (_, i) => ({
        id: `mr_${i}`,
        kind: "expense",
        merchantKey: `магазин${"абвгд"[i % 5]}${"абвгд"[Math.floor(i / 5) % 5]}${i}`,
        categoryId: "food",
        label: `М${i}`,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      }),
    );
    const { result } = renderHook(() => useHarness(toast, full));
    let ok = true;
    act(() => {
      ok = result.current.actions.createRule(SILPO, "transport");
    });
    expect(ok).toBe(false);
    expect(result.current.api.merchantRules).toHaveLength(MERCHANT_RULES_LIMIT);
    expect(warning).toHaveBeenCalledWith(
      `Забагато правил, ліміт ${MERCHANT_RULES_LIMIT}. Прибери зайві в Налаштуваннях, розділ Фінік.`,
    );
  });

  it("прибирає правило з тостом «Повернути» і відновлює його з тосту", () => {
    const { toast, show } = makeToast();
    const { result } = renderHook(() => useHarness(toast));
    act(() => {
      result.current.actions.createRule(SILPO, "transport");
    });
    const rule = result.current.api.merchantRules[0]!;

    act(() => result.current.actions.removeRule(rule));
    expect(result.current.api.merchantRules).toEqual([]);
    const { msg, action } = lastAction(show);
    expect(msg).toBe("Правило для «Сільпо №12» прибрано");
    expect(action.label).toBe("Повернути");
    expect(action.kind).toBe("undo");

    act(() => action.onClick());
    expect(result.current.api.merchantRules).toEqual([rule]);
  });

  it("прибирання неіснуючого правила мовчить", () => {
    const { toast, show } = makeToast();
    const { result } = renderHook(() => useHarness(toast));
    act(() =>
      result.current.actions.removeRule({
        id: "mr_ghost",
        kind: "expense",
        merchantKey: "привид",
        categoryId: "food",
        label: "Привид",
        createdAt: "",
        updatedAt: "",
      }),
    );
    expect(show).not.toHaveBeenCalled();
  });

  it("для власної категорії підписує тост її назвою", () => {
    const { toast, show } = makeToast();
    const { result } = renderHook(() =>
      useHarness(toast, [], [{ id: "custom-hobby", label: "Хобі" }]),
    );
    act(() => {
      result.current.actions.createRule(SILPO, "custom-hobby");
    });
    expect(lastAction(show).msg).toBe(
      "Правило збережено: «Сільпо №12» тепер у «Хобі»",
    );
  });
});
