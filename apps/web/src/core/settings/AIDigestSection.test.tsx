/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { STORAGE_KEYS } from "@sergeant/shared";

const digestState = vi.hoisted(() => ({
  digest: null as { generatedAt: string } | null,
  weekRange: "1–7 липня",
}));

vi.mock("../insights/useWeeklyDigest", () => ({
  useWeeklyDigest: () => digestState,
}));

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: vi.fn(() => ""),
  safeWriteLS: vi.fn(),
}));

import { safeWriteLS } from "@shared/lib/storage/storage";
import { AIDigestSection } from "./AIDigestSection";

async function openSection() {
  fireEvent.click(
    await screen.findByRole("button", { name: /AI Звіт тижня/i }),
  );
}

describe("AIDigestSection", () => {
  beforeEach(() => {
    digestState.digest = null;
    digestState.weekRange = "1–7 липня";
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("shows the current week range and generated timestamp when present", async () => {
    digestState.digest = { generatedAt: "2026-07-07T10:00:00.000Z" };
    render(<AIDigestSection />);
    await openSection();

    expect(screen.getByText("1–7 липня")).toBeInTheDocument();
    expect(screen.getByText(/Згенеровано:/i)).toBeInTheDocument();
  });

  it("persists monday auto-generation toggle to localStorage", async () => {
    render(<AIDigestSection />);
    await openSection();

    const toggle = screen.getByRole("switch", {
      name: /Автогенерація щопонеділка/i,
    });
    fireEvent.click(toggle);

    expect(safeWriteLS).toHaveBeenCalledWith(
      STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO,
      "1",
    );
  });
});
