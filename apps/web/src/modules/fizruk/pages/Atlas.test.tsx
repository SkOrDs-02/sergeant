// @vitest-environment jsdom
/**
 * `Atlas.tsx` was 0%-covered — it's a thin page shell over `useRecovery`
 * + `buildAtlasData` + `BodyAtlas`. Mirrors the `useRecovery` mock
 * pattern already used in `Dashboard.test.tsx`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Atlas } from "./Atlas";

vi.mock("../hooks/useRecovery", () => ({
  useRecovery: vi.fn(() => ({
    by: {},
    list: [],
    ready: [],
    avoid: [],
    wellbeingMult: 1,
  })),
}));

describe("Atlas page", () => {
  it("renders the hero heading and the BodyAtlas card", () => {
    render(<Atlas />);
    expect(screen.getByText("Атлас мʼязів")).toBeInTheDocument();
    expect(screen.getByText("Стан відновлення")).toBeInTheDocument();
    expect(screen.getByLabelText("Атлас мʼязів")).toBeInTheDocument();
  });
});
