// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MerchantList } from "./MerchantList";

describe("MerchantList", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<MerchantList merchants={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders ranked merchants with totals and counts", () => {
    render(
      <MerchantList
        merchants={[
          { name: "Сільпо", total: 5000, count: 12 },
          { name: "АТБ", total: 2500, count: 3 },
        ]}
      />,
    );
    expect(screen.getByText("Сільпо")).toBeInTheDocument();
    expect(screen.getByText("АТБ")).toBeInTheDocument();
    // Rank labels.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // Count appears with a pluralized "times" label.
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });
});
