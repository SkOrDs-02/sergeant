// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupersetBadge, SupersetMemberLabel } from "./SupersetBadge";

describe("SupersetBadge", () => {
  it("renders superset label for superset type", () => {
    render(<SupersetBadge type="superset" />);
    expect(screen.getByText("Суперсет")).toBeInTheDocument();
  });

  it("renders circuit label for circuit type", () => {
    render(<SupersetBadge type="circuit" />);
    expect(screen.getByText("Коло")).toBeInTheDocument();
  });

  it("renders abbreviated label for superset type when compact", () => {
    render(<SupersetBadge type="superset" compact />);
    expect(screen.getByText("СС")).toBeInTheDocument();
  });
});

describe("SupersetMemberLabel", () => {
  it("renders an A1-style ordinal for the first member", () => {
    render(<SupersetMemberLabel position={1} />);
    expect(screen.getByText("A1")).toBeInTheDocument();
  });

  it("renders an A2-style ordinal for the second member", () => {
    render(<SupersetMemberLabel position={2} />);
    expect(screen.getByText("A2")).toBeInTheDocument();
  });
});
