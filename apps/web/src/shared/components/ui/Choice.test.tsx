/** @vitest-environment jsdom */
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ChoiceCheckbox,
  ChoiceGroup,
  type ChoiceItem,
  type ChoiceVariant,
} from "./Choice";

const KIND: ChoiceItem<"expense" | "income" | "transfer">[] = [
  { value: "expense", label: "Витрата" },
  { value: "income", label: "Надходження" },
  { value: "transfer", label: "Переказ" },
];

function Controlled({
  variant,
  items = KIND,
  initial = "expense",
  onChange,
}: {
  variant?: ChoiceVariant;
  items?: ChoiceItem<"expense" | "income" | "transfer">[];
  initial?: "expense" | "income" | "transfer" | null;
  onChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ChoiceGroup
      items={items}
      value={value}
      variant={variant}
      ariaLabel="Тип операції"
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

afterEach(cleanup);

const radio = (name: string) => screen.getByRole("radio", { name });

const SCALE: ChoiceItem<"1" | "2" | "3">[] = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
];

function Deselectable({ onChange }: { onChange: (v: string | null) => void }) {
  const [value, setValue] = useState<"1" | "2" | "3" | null>("2");
  return (
    <ChoiceGroup
      items={SCALE}
      value={value}
      ariaLabel="Енергія"
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      onDeselect={() => {
        setValue(null);
        onChange(null);
      }}
    />
  );
}

describe("ChoiceGroup onDeselect", () => {
  it("повторний тап по обраній опції знімає вибір", () => {
    const onChange = vi.fn();
    render(<Deselectable onChange={onChange} />);
    fireEvent.click(radio("2"));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(radio("2")).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getAllByRole("radio").filter((r) => r.tabIndex === 0),
    ).toHaveLength(1);
  });

  it("Space на обраній опції знімає вибір, стрілка вибирає сусідню", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Deselectable onChange={onChange} />);
    radio("2").focus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(null);
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("3");
  });

  it("без пропа повторний тап нічого не робить", () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(radio("Витрата"));
    expect(onChange).not.toHaveBeenCalled();
    expect(radio("Витрата")).toHaveAttribute("aria-checked", "true");
  });
});

describe("ChoiceGroup", () => {
  it.each<ChoiceVariant>(["tiles", "rows"])(
    "%s: radiogroup з aria-checked і заливкою чорнилом лише на обраному",
    (variant) => {
      render(<Controlled variant={variant} />);
      expect(
        screen.getByRole("radiogroup", { name: "Тип операції" }),
      ).toBeInTheDocument();
      expect(radio("Витрата")).toHaveAttribute("aria-checked", "true");
      expect(radio("Надходження")).toHaveAttribute("aria-checked", "false");
      expect(radio("Витрата").className).toContain("bg-text");
      expect(radio("Витрата").className).toContain("text-bg");
      expect(radio("Надходження").className).not.toContain("bg-text");
      expect(screen.queryByText("Обрано")).toBeNull();
    },
  );

  it("tiles: необране на панелі, rows: необране на hairline без заливки", () => {
    const { unmount } = render(<Controlled variant="tiles" />);
    expect(radio("Надходження").className).toContain("bg-panel");
    expect(radio("Надходження").className).toContain("border-control");
    expect(radio("Витрата").className).toContain("border-text");
    expect(radio("Витрата").className).not.toContain("border-control");
    unmount();
    render(<Controlled variant="rows" />);
    expect(screen.getByRole("radiogroup").className).toContain("divide-line");
    expect(radio("Надходження").className).not.toMatch(/(^|\s)bg-panel(\s|$)/);
    expect(radio("Надходження").className).toContain("w-full");
  });

  it("клік обирає опцію, повторний клік по обраній onChange не кличе", () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(radio("Витрата"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(radio("Надходження"));
    expect(onChange).toHaveBeenCalledWith("income");
    expect(radio("Надходження")).toHaveAttribute("aria-checked", "true");
  });

  it("одна зупинка Tab: tabIndex 0 лише в обраної", () => {
    render(<Controlled initial="income" />);
    expect(radio("Надходження")).toHaveAttribute("tabindex", "0");
    expect(radio("Витрата")).toHaveAttribute("tabindex", "-1");
    expect(radio("Переказ")).toHaveAttribute("tabindex", "-1");
  });

  it("без значення Tab веде на першу доступну опцію", () => {
    render(
      <Controlled
        initial={null}
        items={[{ ...KIND[0]!, disabled: true }, KIND[1]!, KIND[2]!]}
      />,
    );
    expect(radio("Витрата")).toHaveAttribute("tabindex", "-1");
    expect(radio("Надходження")).toHaveAttribute("tabindex", "0");
  });

  it("стрілки переводять фокус і вибір по колу, Home / End на край", () => {
    render(<Controlled />);
    radio("Витрата").focus();
    fireEvent.keyDown(radio("Витрата"), { key: "ArrowRight" });
    expect(radio("Надходження")).toHaveFocus();
    expect(radio("Надходження")).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(radio("Надходження"), { key: "ArrowDown" });
    expect(radio("Переказ")).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(radio("Переказ"), { key: "ArrowRight" });
    expect(radio("Витрата")).toHaveFocus();
    expect(radio("Витрата")).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(radio("Витрата"), { key: "ArrowLeft" });
    expect(radio("Переказ")).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(radio("Переказ"), { key: "Home" });
    expect(radio("Витрата")).toHaveFocus();
    fireEvent.keyDown(radio("Витрата"), { key: "End" });
    expect(radio("Переказ")).toHaveFocus();
    expect(radio("Переказ")).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(radio("Переказ"), { key: "ArrowUp" });
    expect(radio("Надходження")).toHaveAttribute("aria-checked", "true");
  });

  it("стрілки пропускають вимкнену опцію", () => {
    render(
      <Controlled
        items={[KIND[0]!, { ...KIND[1]!, disabled: true }, KIND[2]!]}
      />,
    );
    expect(radio("Надходження")).toBeDisabled();
    fireEvent.keyDown(radio("Витрата"), { key: "ArrowRight" });
    expect(radio("Переказ")).toHaveFocus();
    expect(radio("Переказ")).toHaveAttribute("aria-checked", "true");
  });

  it("інші клавіші не перехоплюються", () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const event = fireEvent.keyDown(radio("Витрата"), { key: "a" });
    expect(event).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rows: опис другим рядком, на обраному кольором сторінки", () => {
    render(
      <ChoiceGroup
        variant="rows"
        ariaLabel="Регулярність"
        value="daily"
        onChange={() => {}}
        items={[
          { value: "daily", label: "Щодня", description: "7 разів на тиждень" },
          { value: "weekly", label: "Щотижня", description: "Обраний день" },
        ]}
      />,
    );
    expect(screen.getByText("7 разів на тиждень").className).toContain(
      "text-bg",
    );
    expect(screen.getByText("Обраний день").className).toContain("text-muted");
  });

  it("sm-плитки мають радіус 6, md - 8", () => {
    const { rerender } = render(
      <ChoiceGroup
        items={KIND}
        value="expense"
        onChange={() => {}}
        ariaLabel="Сума"
        size="sm"
      />,
    );
    expect(radio("Витрата").className).toContain("rounded-segment");
    rerender(
      <ChoiceGroup
        items={KIND}
        value="expense"
        onChange={() => {}}
        ariaLabel="Сума"
      />,
    );
    expect(radio("Витрата").className).toContain("rounded-lg");
  });

  it("disabled на групі вимикає всі опції", () => {
    render(
      <ChoiceGroup
        items={KIND}
        value="expense"
        onChange={() => {}}
        ariaLabel="Тип"
        disabled
      />,
    );
    for (const item of screen.getAllByRole("radio")) {
      expect(item).toBeDisabled();
    }
    expect(screen.getByRole("radiogroup")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

function MultiControlled({
  variant,
  initial = ["expense"],
  onChange,
}: {
  variant?: ChoiceVariant;
  initial?: string[];
  onChange?: (v: string[]) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ChoiceGroup
      multiple
      items={[KIND[0]!, KIND[1]!, { ...KIND[2]!, disabled: true }]}
      value={value}
      variant={variant}
      ariaLabel="Типи"
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const checkbox = (name: string) => screen.getByRole("checkbox", { name });

describe("ChoiceGroup multiple", () => {
  it.each<ChoiceVariant>(["tiles", "rows"])(
    "%s: group + checkbox з aria-checked, позначене заливкою чорнилом",
    (variant) => {
      render(<MultiControlled variant={variant} />);
      expect(screen.getByRole("group", { name: "Типи" })).toBeInTheDocument();
      expect(screen.queryByRole("radio")).toBeNull();
      expect(checkbox("Витрата")).toHaveAttribute("aria-checked", "true");
      expect(checkbox("Надходження")).toHaveAttribute("aria-checked", "false");
      const fill =
        variant === "tiles"
          ? checkbox("Витрата")
          : checkbox("Витрата").querySelector("[aria-hidden]")!;
      expect(fill.className).toContain("bg-text");
      expect(fill.className).toContain("text-bg");
      const empty =
        variant === "tiles"
          ? checkbox("Надходження")
          : checkbox("Надходження").querySelector("[aria-hidden]")!;
      expect(empty.className).not.toContain("bg-text");
    },
  );

  it("клік додає й знімає значення, вимкнена опція не перемикається", () => {
    const onChange = vi.fn();
    render(<MultiControlled variant="rows" onChange={onChange} />);
    fireEvent.click(checkbox("Надходження"));
    expect(onChange).toHaveBeenLastCalledWith(["expense", "income"]);
    expect(checkbox("Надходження")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(checkbox("Витрата"));
    expect(onChange).toHaveBeenLastCalledWith(["income"]);
    expect(checkbox("Переказ")).toBeDisabled();
  });

  it.each<ChoiceVariant>(["tiles", "rows"])(
    "%s: Space перемикає сфокусовану опцію",
    async (variant) => {
      const onChange = vi.fn();
      render(<MultiControlled variant={variant} onChange={onChange} />);
      checkbox("Надходження").focus();
      await userEvent.keyboard(" ");
      expect(onChange).toHaveBeenLastCalledWith(["expense", "income"]);
      expect(checkbox("Надходження")).toHaveAttribute("aria-checked", "true");
      await userEvent.keyboard(" ");
      expect(checkbox("Надходження")).toHaveAttribute("aria-checked", "false");
    },
  );

  it("рядок: hover видно на панелі (рівень вище за panel)", () => {
    render(<MultiControlled variant="rows" />);
    expect(checkbox("Витрата").className).toContain("enabled:hover:bg-panelHi");
  });

  it("кожна опція - своя зупинка Tab, стрілки вибір не міняють", () => {
    const onChange = vi.fn();
    render(<MultiControlled onChange={onChange} />);
    expect(checkbox("Витрата")).not.toHaveAttribute("tabindex", "-1");
    expect(checkbox("Надходження")).not.toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(checkbox("Витрата"), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
    expect(checkbox("Витрата").tagName).toBe("BUTTON");
  });
});

describe("ChoiceCheckbox", () => {
  it("перемикає стан, несе опис і aria-checked", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ChoiceCheckbox
        checked={false}
        onChange={onChange}
        label="Запамʼятати"
        description="Для повтору"
      />,
    );
    const box = screen.getByRole("checkbox", { name: "Запамʼятати" });
    expect(box).toHaveAccessibleDescription("Для повтору");
    expect(box).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Для повтору").className).toContain("text-muted");
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(
      <ChoiceCheckbox checked onChange={onChange} label="Запамʼятати" />,
    );
    expect(screen.getByRole("checkbox")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("вимкнений не перемикається", () => {
    const onChange = vi.fn();
    render(
      <ChoiceCheckbox checked onChange={onChange} label="Молоко" disabled />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
