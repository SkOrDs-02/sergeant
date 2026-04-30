import { describe, expect, it } from "vitest";
import { parseCommand } from "./router.js";

describe("console agent router", () => {
  it("routes explicit ops commands", () => {
    expect(parseCommand("/ops deploy status")).toEqual({
      agent: "ops",
      query: "deploy status",
    });
  });

  it("routes explicit content commands", () => {
    expect(parseCommand("/content release post")).toEqual({
      agent: "marketing",
      query: "release post",
    });
  });

  it("keeps ambiguous text unknown", () => {
    expect(parseCommand("hello there")).toEqual({
      agent: "unknown",
      query: "hello there",
    });
  });

  it("routes /help command", () => {
    expect(parseCommand("/help")).toEqual({
      agent: "help",
      query: "",
    });
  });

  it("routes /start command as help", () => {
    expect(parseCommand("/start")).toEqual({
      agent: "help",
      query: "",
    });
  });

  it("classifies ops-related free text", () => {
    expect(parseCommand("сервер впав, помилка 500").agent).toBe("ops");
  });

  it("classifies marketing-related free text", () => {
    expect(parseCommand("напиши пост про реліз").agent).toBe("marketing");
  });
});
