import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chatApi } from "@shared/api";

// ─── Dependency mocks ─────────────────────────────────────────────────────────
//
// budgetsLib.ts → @shared/api → @shared/lib (barrel) → @shared/lib/storage/storage
//              → kvStoreBoot.ts → @sergeant/db-schema/sqlite
// None of that is available in the Node test environment. We mock every
// import that causes the chain to break before the actual module loads.
//
// Both mocks below are used explicitly in the test body (readJSON/writeJSON
// are exercised; chatApi is referenced so linting treats the mock as active).

// 1. Block the SQLite chain by replacing storage.ts's problematic transitive
//    dependencies at the level where budgetsLib.ts itself would pull them in.
vi.mock("@shared/api", () => ({
  chatApi: {
    send: vi.fn().mockResolvedValue({ text: null }),
  },
}));

// 2. Replace the localStorage layer with a simple in-memory store.
const _store: Record<string, unknown> = {};
vi.mock("../../lib/finykStorage", () => ({
  readJSON: (key: string, fallback: unknown = null): unknown =>
    key in _store ? _store[key] : fallback,
  writeJSON: (key: string, value: unknown): boolean => {
    _store[key] = value;
    return true;
  },
}));

// Import the module under test AFTER mocks are registered (vi.mock hoists,
// but the explicit import here makes the dependency order readable).
import {
  proactiveCacheKey,
  PROACTIVE_CACHE_TTL,
  fetchProactiveAdvice,
  loadProactiveAdviceFromLS,
  saveProactiveAdviceToLS,
} from "./budgetsLib";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clearStore(): void {
  Object.keys(_store).forEach((k) => delete _store[k]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("proactiveCacheKey", () => {
  it("includes both categoryId and monthKey in the output", () => {
    const k = proactiveCacheKey("food", "2026-05");
    expect(k).toContain("food");
    expect(k).toContain("2026-05");
  });

  it("produces different keys for different categoryIds", () => {
    expect(proactiveCacheKey("food", "2026-05")).not.toBe(
      proactiveCacheKey("transport", "2026-05"),
    );
  });

  it("produces different keys for different monthKeys", () => {
    expect(proactiveCacheKey("food", "2026-05")).not.toBe(
      proactiveCacheKey("food", "2026-06"),
    );
  });
});

describe("PROACTIVE_CACHE_TTL", () => {
  it("is 24 hours in milliseconds", () => {
    expect(PROACTIVE_CACHE_TTL).toBe(24 * 60 * 60 * 1000);
  });
});

describe("loadProactiveAdviceFromLS", () => {
  beforeEach(() => clearStore());
  afterEach(() => vi.restoreAllMocks());

  it("returns null when cache is empty", () => {
    expect(loadProactiveAdviceFromLS("food", "2026-05")).toBeNull();
  });

  it("returns cached text when within TTL", () => {
    const key = proactiveCacheKey("food", "2026-05");
    _store[key] = { text: "Buy less coffee", ts: Date.now() };

    const result = loadProactiveAdviceFromLS("food", "2026-05");
    expect(result).not.toBeNull();
    expect(result?.text).toBe("Buy less coffee");
  });

  it("returns null when cache is expired (older than TTL)", () => {
    const key = proactiveCacheKey("food", "2026-05");
    _store[key] = {
      text: "Old advice",
      ts: Date.now() - PROACTIVE_CACHE_TTL - 1,
    };

    expect(loadProactiveAdviceFromLS("food", "2026-05")).toBeNull();
  });

  it("returns null for malformed cache (no text field)", () => {
    const key = proactiveCacheKey("food", "2026-05");
    _store[key] = { ts: Date.now() };

    expect(loadProactiveAdviceFromLS("food", "2026-05")).toBeNull();
  });

  it("returns null for malformed cache (no ts field)", () => {
    const key = proactiveCacheKey("food", "2026-05");
    _store[key] = { text: "Some advice" };

    expect(loadProactiveAdviceFromLS("food", "2026-05")).toBeNull();
  });
});

describe("saveProactiveAdviceToLS", () => {
  beforeEach(() => clearStore());

  it("saves and makes loadable within TTL", () => {
    saveProactiveAdviceToLS("food", "2026-05", "Spend less on snacks");
    expect(loadProactiveAdviceFromLS("food", "2026-05")?.text).toBe(
      "Spend less on snacks",
    );
  });

  it("scopes cache by category and month", () => {
    saveProactiveAdviceToLS("food", "2026-05", "Advice A");
    saveProactiveAdviceToLS("transport", "2026-05", "Advice B");

    expect(loadProactiveAdviceFromLS("food", "2026-05")?.text).toBe("Advice A");
    expect(loadProactiveAdviceFromLS("transport", "2026-05")?.text).toBe(
      "Advice B",
    );
  });
});

describe("fetchProactiveAdvice", () => {
  beforeEach(() => {
    clearStore();
    vi.clearAllMocks();
  });

  it("sends a Ukrainian prompt and caches non-empty AI advice", async () => {
    vi.mocked(chatApi.send).mockResolvedValueOnce({
      text: "Залиш каву на завтра.",
    });

    await expect(
      fetchProactiveAdvice({
        categoryId: "coffee",
        monthKey: "2026-07",
        catLabel: "Кава",
        spent: 1200,
        limit: 1500,
        remaining: 300,
        pct: 80,
        daysRemaining: 5,
      }),
    ).resolves.toBe("Залиш каву на завтра.");

    expect(chatApi.send).toHaveBeenCalledWith({
      context:
        "[Проактивна AI-порада] Категорія: Кава, витрачено: 1200 ₴, ліміт: 1500 ₴, залишок: 300 ₴, днів до кінця місяця: 5",
      messages: [
        {
          role: "user",
          content: expect.stringContaining("Відповідь виключно українською"),
        },
      ],
    });
    expect(loadProactiveAdviceFromLS("coffee", "2026-07")?.text).toBe(
      "Залиш каву на завтра.",
    );
  });

  it("returns null and skips cache writes for empty AI responses", async () => {
    vi.mocked(chatApi.send).mockResolvedValueOnce({ text: "" });

    await expect(
      fetchProactiveAdvice({
        categoryId: "food",
        monthKey: "2026-07",
        catLabel: "Їжа",
        spent: 100,
        limit: 1000,
        remaining: 900,
        pct: 10,
        daysRemaining: 12,
      }),
    ).resolves.toBeNull();

    expect(loadProactiveAdviceFromLS("food", "2026-07")).toBeNull();
  });
});
