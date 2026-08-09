// @vitest-environment jsdom
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LEGAL_COOKIES_PATH,
  LEGAL_OFFER_PATH,
  LEGAL_PRIVACY_PATH,
  LEGAL_TERMS_PATH,
} from "../app/appPaths";
import { LegalPage } from "./LegalPage";

// This suite pins the behaviour of the commerce/legal surfaces as they look
// when SHOWN. Both are hidden by default for the closed beta, so the gate is
// forced on here — otherwise re-enabling them later would ship against zero
// coverage. The hidden state is covered in `core/lib/betaSurfaces.hidden.test.tsx`.
vi.mock("../lib/betaSurfaces", () => ({
  COMMERCE_SURFACES_ENABLED: true,
  LEGAL_SURFACES_ENABLED: true,
}));

const cases = [
  [LEGAL_PRIVACY_PATH, "Політика приватності"],
  [LEGAL_TERMS_PATH, "Умови користування"],
  [LEGAL_COOKIES_PATH, "Політика cookies"],
  [LEGAL_OFFER_PATH, "Публічна оферта"],
] as const;

describe("LegalPage", () => {
  it.each(cases)(
    "renders public legal page %s with heading and footer links",
    (pathname, heading) => {
      render(
        <MemoryRouter>
          <LegalPage pathname={pathname} />
        </MemoryRouter>,
      );

      expect(
        screen.getByRole("heading", { level: 1, name: heading }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("navigation", { name: "Юридичні документи" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Приватність" })).toHaveAttribute(
        "href",
        LEGAL_PRIVACY_PATH,
      );
      expect(screen.getByRole("link", { name: "Умови" })).toHaveAttribute(
        "href",
        LEGAL_TERMS_PATH,
      );
      expect(screen.getByRole("link", { name: "Cookies" })).toHaveAttribute(
        "href",
        LEGAL_COOKIES_PATH,
      );
      expect(screen.getByRole("link", { name: "Оферта" })).toHaveAttribute(
        "href",
        LEGAL_OFFER_PATH,
      );
    },
  );
});
