import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertOpenClawCommandsValid,
  OPENCLAW_BOT_COMMANDS,
  registerOpenClawBotCommands,
  type BotCommandSpec,
} from "./commands.js";

function makeBotMock() {
  const setMyCommands = vi.fn().mockResolvedValue(true);
  const setChatMenuButton = vi.fn().mockResolvedValue(true);
  return {
    bot: { api: { setMyCommands, setChatMenuButton } },
    setMyCommands,
    setChatMenuButton,
  };
}

describe("OPENCLAW_BOT_COMMANDS registry", () => {
  it("is non-empty and includes the core help / cofounder commands", () => {
    const names = OPENCLAW_BOT_COMMANDS.map((c) => c.command);
    // `/help` is the user-facing entry point — without it the slash
    // popup gives the founder no way to discover the rest.
    expect(names).toContain("help");
    expect(names).toContain("cofounder");
    expect(names).toContain("council");
    expect(names).toContain("budget");
    expect(names).toContain("alerts");
  });

  it("matches Telegram's /^[a-z0-9_]{1,32}$/ command grammar", () => {
    for (const entry of OPENCLAW_BOT_COMMANDS) {
      expect(entry.command).toMatch(/^[a-z0-9_]{1,32}$/);
    }
  });

  it("has unique command names", () => {
    const names = OPENCLAW_BOT_COMMANDS.map((c) => c.command);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has descriptions short enough to render on one line in mobile clients", () => {
    for (const entry of OPENCLAW_BOT_COMMANDS) {
      // 64 is our internal cap — Telegram itself accepts up to 256 but
      // longer strings wrap on iOS / Android.
      expect(entry.description.length).toBeGreaterThanOrEqual(3);
      expect(entry.description.length).toBeLessThanOrEqual(64);
    }
  });

  it("passes assertOpenClawCommandsValid", () => {
    expect(() => assertOpenClawCommandsValid()).not.toThrow();
  });
});

describe("assertOpenClawCommandsValid", () => {
  it("rejects empty registry", () => {
    expect(() => assertOpenClawCommandsValid([])).toThrow(/empty/);
  });

  it("rejects uppercase / hyphen / cyrillic command names", () => {
    const badCases: BotCommandSpec[][] = [
      [{ command: "Help", description: "Capitalised" }],
      [{ command: "agent-status", description: "Hyphen rejected by TG" }],
      [{ command: "хелп", description: "Cyrillic rejected by TG" }],
    ];
    for (const cmds of badCases) {
      expect(() => assertOpenClawCommandsValid(cmds)).toThrow(
        /\^\[a-z0-9_\]\{1,32\}\$/,
      );
    }
  });

  it("rejects duplicate command names", () => {
    expect(() =>
      assertOpenClawCommandsValid([
        { command: "ops", description: "first" },
        { command: "ops", description: "second" },
      ]),
    ).toThrow(/Duplicate/);
  });

  it("rejects descriptions that are too short or too long", () => {
    expect(() =>
      assertOpenClawCommandsValid([{ command: "x", description: "ab" }]),
    ).toThrow(/3\.\.256 chars/);
    expect(() =>
      assertOpenClawCommandsValid([
        { command: "x", description: "y".repeat(300) },
      ]),
    ).toThrow(/3\.\.256 chars/);
  });

  it("rejects descriptions over 64 chars (mobile single-line cap)", () => {
    expect(() =>
      assertOpenClawCommandsValid([
        { command: "x", description: "y".repeat(65) },
      ]),
    ).toThrow(/one line/);
  });
});

describe("registerOpenClawBotCommands", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls setMyCommands with the full registry, then setChatMenuButton with type=commands", async () => {
    const { bot, setMyCommands, setChatMenuButton } = makeBotMock();
    await registerOpenClawBotCommands(bot as never);
    expect(setMyCommands).toHaveBeenCalledTimes(1);
    expect(setMyCommands).toHaveBeenCalledWith(
      OPENCLAW_BOT_COMMANDS.map((c) => ({
        command: c.command,
        description: c.description,
      })),
    );
    expect(setChatMenuButton).toHaveBeenCalledTimes(1);
    expect(setChatMenuButton).toHaveBeenCalledWith({
      menu_button: { type: "commands" },
    });
  });

  it("swallows setMyCommands failures and logs a warning (non-fatal on boot)", async () => {
    const { bot, setMyCommands, setChatMenuButton } = makeBotMock();
    setMyCommands.mockRejectedValueOnce(new Error("Telegram 502"));
    await expect(
      registerOpenClawBotCommands(bot as never),
    ).resolves.toBeUndefined();
    // After setMyCommands fails we skip setChatMenuButton — there's no
    // command list to attach a Menu button to anyway.
    expect(setChatMenuButton).not.toHaveBeenCalled();
  });

  it("swallows setChatMenuButton failures so the bot still boots", async () => {
    const { bot, setMyCommands, setChatMenuButton } = makeBotMock();
    setChatMenuButton.mockRejectedValueOnce(new Error("Telegram 429"));
    await expect(
      registerOpenClawBotCommands(bot as never),
    ).resolves.toBeUndefined();
    expect(setMyCommands).toHaveBeenCalledTimes(1);
    expect(setChatMenuButton).toHaveBeenCalledTimes(1);
  });
});
