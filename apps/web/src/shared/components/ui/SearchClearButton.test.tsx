/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HIDE_NATIVE_SEARCH_CANCEL,
  SearchClearButton,
} from "./SearchClearButton";

describe("SearchClearButton", () => {
  afterEach(() => cleanup());

  it("має доступне імʼя і викликає onClear", () => {
    const onClear = vi.fn();
    render(<SearchClearButton label="Очистити пошук" onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: "Очистити пошук" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("клас ховає саме нативний хрестик пошуку", () => {
    expect(HIDE_NATIVE_SEARCH_CANCEL).toContain("-webkit-search-cancel-button");
  });
});
