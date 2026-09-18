/**
 * Unit-тести для truncate-aware tool_result helper.
 *
 * Покриває:
 * - non-truncated path: контент ≤ threshold проходить як є.
 * - truncated path: контент > threshold → summary з head/tail/marker, повний
 *   blob у breadcrumb, метрика інкрементиться.
 * - non-string content: number/boolean/null/undefined/object → string.
 * - threshold override.
 * - requestId прокидається у breadcrumb-data.
 */
import { describe, it, expect, vi } from "vitest";
import {
  truncateToolResults,
  TOOL_RESULT_TRUNCATE_THRESHOLD,
  type RawToolResult,
} from "./toolResultTruncation.js";

describe("truncateToolResults — short content (≤ threshold)", () => {
  it("повертає контент as-is, breadcrumb та метрику не викликає", () => {
    const addBreadcrumb = vi.fn();
    const recordMetric = vi.fn();
    const out = truncateToolResults(
      [{ tool_use_id: "toolu_1", content: "Транзакцію видалено" }],
      { addBreadcrumb, recordMetric },
    );
    expect(out).toEqual([
      { tool_use_id: "toolu_1", content: "Транзакцію видалено" },
    ]);
    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(recordMetric).not.toHaveBeenCalled();
  });

  it("обробляє number/boolean/null/undefined → строки", () => {
    const out = truncateToolResults([
      { tool_use_id: "n", content: 42 },
      { tool_use_id: "b", content: true },
      { tool_use_id: "u", content: undefined },
      { tool_use_id: "z", content: null },
    ]);
    expect(out).toEqual([
      { tool_use_id: "n", content: "42" },
      { tool_use_id: "b", content: "true" },
      { tool_use_id: "u", content: "ok" },
      { tool_use_id: "z", content: "ok" },
    ]);
  });

  it("серіалізує object content через JSON.stringify", () => {
    const out = truncateToolResults([
      { tool_use_id: "obj", content: { ok: true, count: 3 } },
    ]);
    expect(out[0]!.content).toBe('{"ok":true,"count":3}');
  });

  it("обробляє content рівно на межі threshold (=2000) — не truncate", () => {
    const exact = "a".repeat(TOOL_RESULT_TRUNCATE_THRESHOLD);
    const addBreadcrumb = vi.fn();
    const out = truncateToolResults([{ tool_use_id: "edge", content: exact }], {
      addBreadcrumb,
    });
    expect(out[0]!.content).toBe(exact);
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });
});

describe("truncateToolResults — long content (> threshold)", () => {
  function bigContent(): string {
    // 5000 chars, де перші 600 — "HEAD…", останні 400 — "…TAIL", середина — заповнення
    const head =
      "HEAD_START " +
      "h".repeat(600 - "HEAD_START ".length - "_HEAD_END".length) +
      "_HEAD_END";
    const tail =
      "TAIL_START_" +
      "t".repeat(400 - "TAIL_START_".length - "_TAIL_END".length) +
      "_TAIL_END";
    const middle = "X".repeat(5000 - 600 - 400);
    return head + middle + tail;
  }

  it("замінює content на summary з head + marker + tail", () => {
    const content = bigContent();
    const addBreadcrumb = vi.fn();
    const recordMetric = vi.fn();
    const out = truncateToolResults([{ tool_use_id: "big", content }], {
      addBreadcrumb,
      recordMetric,
    });

    expect(out).toHaveLength(1);
    expect(out[0]!.tool_use_id).toBe("big");
    const summary = out[0]!.content;
    // Head зберігся
    expect(summary).toContain("HEAD_START");
    expect(summary).toContain("_HEAD_END");
    // Tail зберігся
    expect(summary).toContain("TAIL_START_");
    expect(summary).toContain("_TAIL_END");
    // Маркер
    expect(summary).toContain("[…truncated");
    expect(summary).toContain("original 5000 chars");
    // Сильно коротший за оригінал
    expect(summary.length).toBeLessThan(content.length / 2);
  });

  it("шле повний blob у Sentry breadcrumb з category=chat.tool_result", () => {
    const content = bigContent();
    const addBreadcrumb = vi.fn();
    truncateToolResults([{ tool_use_id: "big", content }], {
      addBreadcrumb,
      recordMetric: vi.fn(),
    });

    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    const bc = addBreadcrumb!.mock.calls[0]![0];
    expect(bc.category).toBe("chat.tool_result");
    expect(bc.level).toBe("info");
    expect(bc.message).toMatch(/truncated/i);
    expect(bc.data.tool_use_id).toBe("big");
    expect(bc.data.original_length).toBe(content.length);
    expect(bc.data.threshold).toBe(TOOL_RESULT_TRUNCATE_THRESHOLD);
    expect(bc.data.full).toBe(content);
  });

  it("інкрементить метрику з reason=size_threshold за кожен truncate", () => {
    const recordMetric = vi.fn();
    truncateToolResults(
      [
        { tool_use_id: "a", content: bigContent() },
        { tool_use_id: "b", content: "ok" }, // не truncate
        { tool_use_id: "c", content: bigContent() },
      ],
      { addBreadcrumb: vi.fn(), recordMetric },
    );
    expect(recordMetric).toHaveBeenCalledTimes(2);
    expect(recordMetric).toHaveBeenNthCalledWith(1, {
      reason: "size_threshold",
    });
    expect(recordMetric).toHaveBeenNthCalledWith(2, {
      reason: "size_threshold",
    });
  });

  it("прокидає requestId у breadcrumb data, якщо переданий", () => {
    const addBreadcrumb = vi.fn();
    truncateToolResults([{ tool_use_id: "x", content: bigContent() }], {
      addBreadcrumb,
      recordMetric: vi.fn(),
      requestId: "req-123",
    });
    expect(addBreadcrumb!.mock.calls[0]![0].data.request_id).toBe("req-123");
  });

  it("без requestId — поле request_id у breadcrumb відсутнє", () => {
    const addBreadcrumb = vi.fn();
    truncateToolResults([{ tool_use_id: "x", content: bigContent() }], {
      addBreadcrumb,
      recordMetric: vi.fn(),
    });
    expect(addBreadcrumb!.mock.calls[0]![0].data.request_id).toBeUndefined();
  });

  it("кастомний threshold — нижчий за стандарт — truncate-ає менші тексти", () => {
    const addBreadcrumb = vi.fn();
    const out = truncateToolResults(
      [{ tool_use_id: "small", content: "x".repeat(1500) }],
      { addBreadcrumb, recordMetric: vi.fn(), threshold: 500 },
    );
    expect(out[0]!.content).toContain("[…truncated");
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
  });

  it("серіалізує великий object через JSON, потім truncate-ає", () => {
    const items = Array.from({ length: 200 }, (_, i) => ({
      id: i,
      label: `item-${i}-with-some-padding`,
    }));
    const addBreadcrumb = vi.fn();
    const out = truncateToolResults([{ tool_use_id: "obj", content: items }], {
      addBreadcrumb,
      recordMetric: vi.fn(),
    });
    expect(out[0]!.content).toMatch(/^\[\{"id":0/); // head зберігся
    expect(out[0]!.content).toContain("[…truncated");
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
  });
});

describe("truncateToolResults — порядок і стійкість", () => {
  it("зберігає порядок tool_use_id у вихідному масиві", () => {
    const out = truncateToolResults([
      { tool_use_id: "first", content: "a" },
      { tool_use_id: "second", content: "b" },
      { tool_use_id: "third", content: "c" },
    ]);
    expect(out.map((r) => r.tool_use_id)).toEqual(["first", "second", "third"]);
  });

  it("приймає порожній масив", () => {
    const out = truncateToolResults([] as RawToolResult[]);
    expect(out).toEqual([]);
  });

  it("default-моки на breadcrumb/metric не падають, коли не передані", () => {
    // Без addBreadcrumb/recordMetric helper має не кидати, навіть якщо
    // Sentry/prom-client не ініціалізовані у test-env.
    expect(() =>
      truncateToolResults([{ tool_use_id: "x", content: "a".repeat(3000) }]),
    ).not.toThrow();
  });
});
