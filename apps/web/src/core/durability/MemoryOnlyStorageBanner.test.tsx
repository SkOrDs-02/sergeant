/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import {
  __resetActiveSqliteVfsForTests,
  noteActiveSqliteVfs,
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
