// @vitest-environment jsdom
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToastContainer } from "./Toast";
import { ToastProvider } from "@shared/hooks/useToast";
import ToastMeta, * as ToastStories from "./Toast.stories";
import DataStateMeta, * as DataStateStories from "./DataState.stories";
import ModalMeta, * as ModalStories from "./Modal.stories";
import CommandPaletteMeta, * as CommandPaletteStories from "./CommandPalette.stories";

function renderStory(
  story: unknown,
  args: Record<string, unknown> = {},
): ReactElement {
  const renderFn = (
    story as {
      render?: (
        args: Record<string, unknown>,
        context: unknown,
      ) => ReactElement;
    }
  ).render;
  expect(renderFn).toEqual(expect.any(Function));
  return renderFn?.(args, {}) ?? <span data-testid="missing-story-render" />;
}

describe("shared UI stories", () => {
  it("keeps high-traffic story metadata registered", () => {
    expect(ToastMeta.title).toBe("UI / Toast");
    expect(DataStateMeta.title).toBe("UI / DataState");
    expect(ModalMeta.title).toBe("UI / Modal");
    expect(CommandPaletteMeta.title).toBe("UI / CommandPalette");
  });

  it("renders DataState examples for loaded, loading, empty, error and stale states", () => {
    const loaded = render(renderStory(DataStateStories.Loaded));
    expect(screen.getByText("Сільпо")).toBeInTheDocument();
    loaded.unmount();

    const loading = render(renderStory(DataStateStories.LoadingShapeAware));
    expect(
      loading.container.querySelectorAll("[aria-hidden='true']").length,
    ).toBeGreaterThan(0);
    loading.unmount();

    const empty = render(renderStory(DataStateStories.Empty));
    expect(
      screen.getByText("Немає транзакцій за вибраний період."),
    ).toBeInTheDocument();
    empty.unmount();

    const error = render(renderStory(DataStateStories.ErrorCustom));
    expect(screen.getByText("Не вдалось оновити")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторити запит" }));
    error.unmount();

    render(renderStory(DataStateStories.Stale));
    expect(screen.getByText("оновлюється…")).toBeInTheDocument();
  });

  it("renders Modal examples and opens their dialogs", () => {
    const defaultArgs = ModalMeta.args ?? {};
    const modal = render(renderStory(ModalStories.Default, defaultArgs));

    fireEvent.click(screen.getByRole("button", { name: "Відкрити модал" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Видалення транзакції",
    );
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    modal.unmount();

    render(renderStory(ModalStories.Sizes));
    fireEvent.click(screen.getByRole("button", { name: "SM" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Modal size = sm");
  });

  function renderToastStory(story: unknown) {
    return render(
      <ToastProvider>
        {renderStory(story)}
        <ToastContainer />
      </ToastProvider>,
    );
  }

  it("renders Toast examples through the provider", () => {
    const single = renderToastStory(ToastStories.Single);

    fireEvent.click(
      screen.getByRole("button", { name: "Single toast (success)" }),
    );

    expect(
      screen.getByText("Тренування збережено: +180 ккал."),
    ).toBeInTheDocument();
    single.unmount();

    const showcase = renderToastStory(ToastStories.Showcase);
    for (const name of ["success", "info", "warning", "error"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(screen.getByText(/Sync v2 завершено/)).toBeInTheDocument();
    showcase.unmount();

    const undo = renderToastStory(ToastStories.WithUndo);
    fireEvent.click(
      screen.getByRole("button", { name: "Видалити (undo 5 s)" }),
    );
    expect(screen.getByText("Видалено звичку «Вода»")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повернути" }));
    expect(screen.getByText("Звичку «Вода» повернуто.")).toBeInTheDocument();
    undo.unmount();

    const errorOnly = renderToastStory(ToastStories.ErrorOnly);
    fireEvent.click(screen.getByRole("button", { name: "Тільки error" }));
    expect(
      screen.getByText(/Не вдалося синхронізувати тренування/),
    ).toBeInTheDocument();
    errorOnly.unmount();

    const action = renderToastStory(ToastStories.WithAction);
    fireEvent.click(screen.getByRole("button", { name: "З action-кнопкою" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Error + retry action" }),
    );
    expect(screen.getByText("Транзакцію додано.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(screen.getByText("Скасовано.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторити" }));
    expect(screen.getByText("Рецепт завантажено.")).toBeInTheDocument();
    action.unmount();

    const stack = renderToastStory(ToastStories.Stack);
    fireEvent.click(screen.getByRole("button", { name: "Стек із 4" }));
    fireEvent.click(screen.getByRole("button", { name: "6 поспіль (cap=5)" }));
    expect(screen.getByText("Toast №6")).toBeInTheDocument();
    stack.unmount();

    const duration = renderToastStory(ToastStories.CustomDuration);
    fireEvent.click(screen.getByRole("button", { name: "1s" }));
    fireEvent.click(screen.getByRole("button", { name: "10s" }));
    expect(screen.getByText("Тривалий — 10 секунд.")).toBeInTheDocument();
    duration.unmount();

    renderToastStory(ToastStories.MobileStack);
    fireEvent.click(
      screen.getByRole("button", { name: "Stack of 3 + undo (375 px)" }),
    );
    expect(screen.getByText("Видалено категорію «Кафе»")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повернути" }));
    expect(screen.getByText("Категорію повернуто.")).toBeInTheDocument();
  });

  it("renders CommandPalette examples and opens seeded commands", async () => {
    render(renderStory(CommandPaletteStories.Default));

    fireEvent.click(screen.getByRole("button", { name: "Відкрити палітру" }));

    expect(await screen.findByText("Перейти на головну")).toBeInTheDocument();
    expect(screen.getByText("Налаштування експорту")).toBeInTheDocument();
  });

  it("renders the initially-open command palette story", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    render(renderStory(CommandPaletteStories.InitiallyOpen));

    expect(
      await screen.findByText("Запитати AI-асистента"),
    ).toBeInTheDocument();
  });
});
