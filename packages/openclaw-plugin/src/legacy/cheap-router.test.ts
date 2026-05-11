import { describe, it, expect, vi } from "vitest";
import {
  CheapRouter,
  CheapRouterResponseSchema,
  routineToShortcutSlug,
  isLayer2Escalation,
  isChatResponse,
  type LlmClassifier,
  type CheapRouterResponse,
} from "./cheap-router.js";

const makeClassifier = (response: CheapRouterResponse): LlmClassifier =>
  vi.fn(async () => ({
    text: JSON.stringify(response),
    costUsd: 0.0002,
  }));

describe("CheapRouter", () => {
  it("classifies a metrics question as routine_metrics", async () => {
    const classify = makeClassifier({
      class: "routine_metrics",
      shortcut: "metrics",
      persona: null,
      params: null,
      chat_response: null,
    });

    const router = new CheapRouter({ classify });
    const result = await router.route("скільки сьогодні підписок?");

    expect(result.classification.class).toBe("routine_metrics");
    expect(result.classification.shortcut).toBe("metrics");
    expect(result.costUsd).toBe(0.0002);
  });

  it("classifies thinking question with persona", async () => {
    const classify = makeClassifier({
      class: "thinking",
      shortcut: null,
      persona: "eng",
      params: null,
      chat_response: null,
    });

    const router = new CheapRouter({ classify });
    const result = await router.route("як нам оптимізувати запити до БД?");

    expect(result.classification.class).toBe("thinking");
    expect(result.classification.persona).toBe("eng");
  });

  it("returns chat with short response", async () => {
    const classify = makeClassifier({
      class: "chat",
      shortcut: null,
      persona: null,
      params: null,
      chat_response: "Привіт! Як можу допомогти?",
    });

    const router = new CheapRouter({ classify });
    const result = await router.route("привіт");

    expect(result.classification.class).toBe("chat");
    expect(result.classification.chat_response).toBe(
      "Привіт! Як можу допомогти?",
    );
  });

  it("handles JSON with markdown code fences", async () => {
    const classify: LlmClassifier = vi.fn(async () => ({
      text: '```json\n{"class": "chat", "chat_response": "ok"}\n```',
      costUsd: 0.0002,
    }));

    const router = new CheapRouter({ classify });
    const result = await router.route("test");

    expect(result.classification.class).toBe("chat");
  });

  it("falls back to chat on parse error", async () => {
    const classify: LlmClassifier = vi.fn(async () => ({
      text: "not valid json at all",
      costUsd: 0.0002,
    }));

    const router = new CheapRouter({ classify });
    const result = await router.route("test");

    expect(result.classification.class).toBe("chat");
    expect(result.classification.chat_response).toContain("не вдалось");
    expect(result.costUsd).toBe(0);
  });

  it("falls back to chat on network error", async () => {
    const classify: LlmClassifier = vi.fn(async () => {
      throw new Error("connection refused");
    });

    const router = new CheapRouter({ classify });
    const result = await router.route("test");

    expect(result.classification.class).toBe("chat");
    expect(result.costUsd).toBe(0);
  });
});

describe("CheapRouterResponseSchema", () => {
  it("validates correct response", () => {
    const result = CheapRouterResponseSchema.parse({
      class: "routine_metrics",
      shortcut: "metrics",
      persona: null,
      params: null,
    });
    expect(result.class).toBe("routine_metrics");
  });

  it("rejects invalid class", () => {
    expect(() =>
      CheapRouterResponseSchema.parse({
        class: "invalid_class",
        shortcut: null,
      }),
    ).toThrow();
  });
});

describe("routineToShortcutSlug", () => {
  it("maps routine_metrics to metrics", () => {
    expect(
      routineToShortcutSlug({ class: "routine_metrics", shortcut: null }),
    ).toBe("metrics");
  });

  it("prefers explicit shortcut over mapping", () => {
    expect(
      routineToShortcutSlug({ class: "routine_metrics", shortcut: "posthog" }),
    ).toBe("posthog");
  });

  it("returns null for non-routine classes", () => {
    expect(routineToShortcutSlug({ class: "thinking" })).toBeNull();
    expect(routineToShortcutSlug({ class: "chat" })).toBeNull();
  });
});

describe("isLayer2Escalation", () => {
  it("returns true for thinking", () => {
    expect(isLayer2Escalation({ class: "thinking" })).toBe(true);
  });

  it("returns false for others", () => {
    expect(isLayer2Escalation({ class: "chat" })).toBe(false);
    expect(isLayer2Escalation({ class: "routine_metrics" })).toBe(false);
  });
});

describe("isChatResponse", () => {
  it("returns true for chat", () => {
    expect(isChatResponse({ class: "chat" })).toBe(true);
  });

  it("returns false for thinking", () => {
    expect(isChatResponse({ class: "thinking" })).toBe(false);
  });
});
