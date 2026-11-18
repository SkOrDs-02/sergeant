/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import {
  __resetActiveSqliteVfsForTests,
  noteActiveSqliteVfs,
  noteSqliteLegacyStoreKept,
  noteSqliteVfsFallbackReason,
} from "../db/storageBackendState";
import { messagesEn } from "@shared/i18n/en";
import { messages } from "@shared/i18n/uk";
import { MemoryOnlyStorageBanner } from "./MemoryOnlyStorageBanner";

const m = messages.durability.memoryOnly;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  __resetActiveSqliteVfsForTests();
});

describe("MemoryOnlyStorageBanner", () => {
  it("зʼявляється, щойно база відкрилась у памʼяті після першого рендера", () => {
    render(<MemoryOnlyStorageBanner />);
    expect(screen.queryByText(m.title)).toBeNull();

    act(() => noteActiveSqliteVfs("memory"));

    expect(screen.getByText(m.title)).toBeTruthy();
    expect(screen.getByText(m.body)).toBeTruthy();
    expect(screen.getByRole("button", { name: m.reload })).toBeTruthy();
  });

  it("мовчить на персистентному сховищі", () => {
    noteActiveSqliteVfs("opfs-sahpool");
    render(<MemoryOnlyStorageBanner />);
    expect(screen.queryByText(m.title)).toBeNull();
  });

  it("називає іншу вкладку, коли пул тримає вона", () => {
    noteSqliteVfsFallbackReason("pool-busy");
    noteActiveSqliteVfs("memory");
    render(<MemoryOnlyStorageBanner />);
    expect(screen.getByText(m.bodyOtherTab)).toBeTruthy();
  });

  // PR-T1 (2026-11-18): браузер без OPFS у воркері. Reload нічого не
  // змінить, тож банер його не пропонує і каже, що робити насправді.
  it("на браузері без OPFS у воркері не обіцяє, що reload допоможе", () => {
    noteSqliteVfsFallbackReason("unsupported");
    noteActiveSqliteVfs("memory");
    render(<MemoryOnlyStorageBanner />);
    expect(screen.getByText(m.title)).toBeTruthy();
    expect(screen.getByText(m.bodyUnsupported)).toBeTruthy();
    expect(screen.queryByRole("button", { name: m.reload })).toBeNull();
    expect(screen.queryByText(m.body)).toBeNull();
  });

  it("каже, що старі записи цілі, лише коли старе сховище справді є", () => {
    noteSqliteVfsFallbackReason("unsupported");
    noteSqliteLegacyStoreKept();
    noteActiveSqliteVfs("memory");
    render(<MemoryOnlyStorageBanner />);
    expect(
      screen.getByText(`${m.bodyUnsupported} ${m.legacyKept}`),
    ).toBeTruthy();
  });

  // CodeRabbit на #1692: позначку «старе сховище збережено» ставимо за
  // будь-якої відмови OPFS, тож банер має казати про неї і поза
  // «не підтримується» — але без обіцянки «повернуться після оновлення».
  it.each([null, "pool-busy"] as const)(
    "причина %s: каже про старі записи нейтрально й лишає reload",
    (reason) => {
      if (reason) noteSqliteVfsFallbackReason(reason);
      noteSqliteLegacyStoreKept();
      noteActiveSqliteVfs("memory");
      render(<MemoryOnlyStorageBanner />);
      const body = reason === "pool-busy" ? m.bodyOtherTab : m.body;
      expect(screen.getByText(`${body} ${m.legacyKeptOther}`)).toBeTruthy();
      expect(screen.queryByText(new RegExp(m.legacyKept))).toBeNull();
      expect(screen.getByRole("button", { name: m.reload })).toBeTruthy();
    },
  );

  it("показує англійські рядки в EN-локалі", () => {
    localStorage.setItem("sergeant:locale", "en");
    noteActiveSqliteVfs("memory");
    render(<MemoryOnlyStorageBanner />);
    const enM = messagesEn.durability?.memoryOnly;
    expect(enM).toBeTruthy();
    expect(screen.getByText(enM!.title)).toBeTruthy();
    expect(screen.getByText(enM!.body)).toBeTruthy();
    expect(screen.getByRole("button", { name: enM!.reload })).toBeTruthy();
    expect(screen.queryByText(m.title)).toBeNull();
  });
});
