// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LegalDocumentView } from "./LegalDocumentView";

afterEach(cleanup);

describe("LegalDocumentView", () => {
  it("owns a viewport-height scroll container", () => {
    render(
      <MemoryRouter>
        <LegalDocumentView
          lastUpdated="15 липня 2026"
          document={{
            eyebrow: "Юридичне",
            title: "Умови використання",
            intro: "Вступ",
            sections: [{ title: "Розділ", body: ["Текст"] }],
          }}
        />
      </MemoryRouter>,
    );

    const scroller = screen.getByTestId("legal-scroll-container");
    expect(scroller).toHaveClass("h-app-dvh", "min-h-0", "overflow-y-auto");
  });
});
