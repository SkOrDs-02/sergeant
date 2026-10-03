// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantRule } from "@sergeant/finyk-domain/lib/merchantRules";
import { MerchantRuleOffer } from "./MerchantRuleOffer";

afterEach(cleanup);

const RULE: MerchantRule = {
  id: "mr_1",
  kind: "expense",
  merchantKey: "сільпо",
  categoryId: "food",
  label: "Сільпо",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
};

function renderOffer(
  props: Partial<Parameters<typeof MerchantRuleOffer>[0]> = {},
) {
  const onCreate = vi.fn();
  const onRemove = vi.fn();
  const view = render(
    <MerchantRuleOffer
      transaction={{ description: "Сільпо №123", amount: -25000 }}
      isIncome={false}
      overrideCatId="transport"
      rule={null}
      customCategories={[]}
      onCreate={onCreate}
      onRemove={onRemove}
      {...props}
    />,
  );
  return { onCreate, onRemove, ...view };
}

describe("MerchantRuleOffer", () => {
  it("після явної зміни категорії пропонує «Завжди так» одним тапом", () => {
    const { onCreate } = renderOffer();
    const button = screen.getByRole("button", {
      name: "Завжди так для «Сільпо №123»",
    });
    fireEvent.click(button);
    expect(onCreate).toHaveBeenCalledWith("transport");
    expect(screen.getByText(/підуть у «Транспорт»/)).toBeInTheDocument();
  });

  it("кнопка займає повну висоту дотик-цілі (h-11 = 44 px)", () => {
    renderOffer();
    const button = screen.getByRole("button", {
      name: /Завжди так для/,
    });
    expect(button.className).toMatch(/\bh-11\b/);
  });

  it("не пропонує нічого, поки явного override-а нема", () => {
    renderOffer({ overrideCatId: null });
    expect(screen.queryByTestId("merchant-rule-offer")).toBeNull();
    expect(screen.queryByTestId("merchant-rule-active")).toBeNull();
  });

  it("не пропонує правило на «Внутрішній переказ»", () => {
    renderOffer({ overrideCatId: "internal_transfer" });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("не пропонує, коли в описі немає літер (нема що запамʼятовувати)", () => {
    renderOffer({ transaction: { description: "123456", amount: -100 } });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("довгу назву мерчанта скорочує в кнопці, а не розпирає рядок", () => {
    renderOffer({
      transaction: {
        description: "Дуже довга назва магазину якої не буває на кнопці",
        amount: -100,
      },
    });
    const button = screen.getByRole("button", { name: /Завжди так для/ });
    expect(button.textContent).toContain("…");
  });

  it("діюче правило з тією ж категорією показує «Прибрати правило»", () => {
    const { onRemove, onCreate } = renderOffer({
      overrideCatId: "food",
      rule: RULE,
    });
    expect(screen.getByText(/Діє правило для «Сільпо/)).toBeInTheDocument();
    expect(screen.getByText(/йдуть у «Продукти»/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Прибрати правило" }));
    expect(onRemove).toHaveBeenCalledWith(RULE);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("правило без override-а (категорію дає саме воно) теж показує його", () => {
    renderOffer({ overrideCatId: null, rule: RULE });
    expect(screen.getByTestId("merchant-rule-active")).toBeInTheDocument();
  });

  it("override в іншу категорію, ніж у правила, пропонує «Оновити правило»", () => {
    const { onCreate } = renderOffer({
      overrideCatId: "transport",
      rule: RULE,
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Оновити правило для/ }),
    );
    expect(onCreate).toHaveBeenCalledWith("transport");
    expect(screen.queryByTestId("merchant-rule-active")).toBeNull();
  });

  it("правило, чию категорію видалено, не видає себе за діюче", () => {
    renderOffer({
      overrideCatId: null,
      rule: { ...RULE, categoryId: "custom-gone" },
    });
    expect(screen.queryByTestId("merchant-rule-active")).toBeNull();
  });

  it("для надходження формулює підказку про відправника", () => {
    renderOffer({
      transaction: { description: "Іван Петренко", amount: 50000 },
      isIncome: true,
      overrideCatId: "salary",
    });
    expect(screen.getByText(/від цього відправника/)).toBeInTheDocument();
  });

  it("без колбеків не рендерить нічого", () => {
    renderOffer({ onCreate: undefined, onRemove: undefined });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
