/** @vitest-environment jsdom */
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CollectionManager } from "./CollectionManager";

afterEach(cleanup);

function Harness() {
  const [items, setItems] = useState(
    Array.from({ length: 60 }, (_, i) => `Запис ${i}`),
  );
  return (
    <CollectionManager
      title="Каталог"
      description="Керування записами"
      count={items.length}
    >
      {(query) => (
        <ul>
          {items
            .filter((item) => item.toLocaleLowerCase("uk-UA").includes(query))
            .map((item) => (
              <li key={item}>
                {item}
                <button
                  onClick={() =>
                    setItems(items.filter((entry) => entry !== item))
                  }
                  aria-label={`Видалити ${item}`}
                >
                  Видалити
                </button>
              </li>
            ))}
        </ul>
      )}
    </CollectionManager>
  );
}

describe("CollectionManager", () => {
  it("keeps a large collection out of settings until the manager opens", () => {
    render(<Harness />);
    expect(screen.getByText("Записів: 60")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Керувати: Каталог" }));
    const dialog = screen.getByRole("dialog", { name: "Каталог" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(60);
  });

  it("searches inside the manager, applies actions, and clears search on reopening", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Керувати: Каталог" }));
    const dialog = screen.getByRole("dialog", { name: "Каталог" });
    fireEvent.change(within(dialog).getByRole("searchbox"), {
      target: { value: "  ЗАПИС 59  " },
    });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Видалити Запис 59" }),
    );
    expect(within(dialog).queryByRole("listitem")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Закрити" }));
    expect(screen.getByText("Записів: 59")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Керувати: Каталог" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getAllByRole("listitem")).toHaveLength(59);
  });
});
