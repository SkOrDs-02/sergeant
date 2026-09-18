// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { CHECKLIST_ACTIONS } from "@sergeant/shared";
import { SETTINGS_SECTIONS_CATALOG } from "../../../core/hub/settingsSectionsCatalog";
import {
  openHubModule,
  openHubModuleWithAction,
  openHubSettingsSection,
  HUB_OPEN_MODULE_EVENT,
  HUB_OPEN_SETTINGS_EVENT,
} from "./hubNav";

// `openHubModuleWithAction`'s production path routes through `logger.error`
// (Sentry breadcrumb), not a bare `console.error` — same contract as
// `shared/lib/log/logger.test.ts`. `vi.hoisted` is required (not a plain
// top-level `const`) because `./hubNav` is a STATIC import here — the
// hoisted `vi.mock` factory would otherwise run before the `const`
// initializer, unlike `logger.test.ts`'s dynamic `await import("./logger")`.
const { addSentryBreadcrumb, captureException } = vi.hoisted(() => ({
  addSentryBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("../../../core/observability/sentry", () => ({
  addSentryBreadcrumb,
  captureException,
}));

// Vitest 4 widened the default `Mock` to `Mock<Procedure | Constructable>`,
// which is no longer assignable to `EventListenerOrEventListenerObject`.
// Pin the call signature so the spy round-trips through `addEventListener`
// without a per-call cast.
type EventSpy = Mock<(event: Event) => void>;

describe("openHubModule", () => {
  let listener: EventSpy;

  beforeEach(() => {
    listener = vi.fn<(event: Event) => void>();
    window.addEventListener(HUB_OPEN_MODULE_EVENT, listener);
  });
  afterEach(() => {
    window.removeEventListener(HUB_OPEN_MODULE_EVENT, listener);
  });

  it("диспатчить CustomEvent з module та hash", () => {
    openHubModule("finyk", "/analytics");
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail).toEqual({ module: "finyk", hash: "/analytics" });
  });

  it("не диспатчить для невалідного moduleId", () => {
    // @ts-expect-error тестуємо runtime guard
    openHubModule("invalid");
    expect(listener).not.toHaveBeenCalled();
  });

  it("hash за замовчуванням — порожній рядок", () => {
    openHubModule("fizruk");
    const detail = (listener.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail.hash).toBe("");
  });
});

describe("openHubModuleWithAction", () => {
  let listener: EventSpy;

  beforeEach(() => {
    listener = vi.fn<(event: Event) => void>();
    window.addEventListener(HUB_OPEN_MODULE_EVENT, listener);
  });
  afterEach(() => {
    window.removeEventListener(HUB_OPEN_MODULE_EVENT, listener);
    // Безумовно, а не в кінці тіла тесту: `vi.stubEnv("DEV", …)` нижче
    // перевіряє dev-гілку гварда, і якщо `expect` упаде раніше за
    // прибирання, `DEV=false` протече в наступні тести цього файлу —
    // вони перевірятимуть прод-гілку, думаючи, що перевіряють dev
    // (знахідка рев'ю до PR #1106).
    vi.unstubAllEnvs();
  });

  it("диспатчить з action", () => {
    openHubModuleWithAction("finyk", "add_expense");
    const detail = (listener.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail.action).toBe("add_expense");
    expect(detail.module).toBe("finyk");
  });

  it("голосно кидає помилку для невалідної дії замість мовчазного return (F3, 2026-09-11)", () => {
    expect(() => {
      // @ts-expect-error тестуємо runtime guard навмисно з невалідною дією
      openHubModuleWithAction("finyk", "invalid_action");
    }).toThrow(/unknown action/i);
    expect(listener).not.toHaveBeenCalled();
  });

  it("в production логує через logger.error (Sentry breadcrumb), не кидає, і все одно не диспатчить", () => {
    vi.stubEnv("DEV", false);
    addSentryBreadcrumb.mockClear();
    expect(() => {
      // @ts-expect-error тестуємо runtime guard навмисно з невалідною дією
      openHubModuleWithAction("finyk", "invalid_action");
    }).not.toThrow();
    expect(addSentryBreadcrumb).toHaveBeenCalledTimes(1);
    expect(addSentryBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: "web.logger", level: "error" }),
    );
    expect(listener).not.toHaveBeenCalled();
  });

  // F3 audit (2026-09-11): `VALID_HUB_ACTIONS` used to be a hand-maintained
  // list of only the 5 original PWA shortcuts — `set_budget`,
  // `connect_bank`, `view_analytics` (and every other checklist-declared
  // action) silently failed this gate. It now derives from
  // `CHECKLIST_ACTIONS`, so every action a checklist step can name must
  // dispatch successfully.
  it("dispatches for every canonical checklist action, not just the 5 original PWA shortcuts", () => {
    for (const action of CHECKLIST_ACTIONS) {
      listener.mockClear();
      openHubModuleWithAction("finyk", action);
      expect(listener).toHaveBeenCalledTimes(1);
    }
  });
});

describe("openHubSettingsSection", () => {
  let listener: EventSpy;

  beforeEach(() => {
    listener = vi.fn<(event: Event) => void>();
    window.addEventListener(HUB_OPEN_SETTINGS_EVENT, listener);
  });
  afterEach(() => {
    window.removeEventListener(HUB_OPEN_SETTINGS_EVENT, listener);
  });

  it("диспатчить CustomEvent з section", () => {
    openHubSettingsSection("dashboard");
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail).toEqual({ section: "dashboard" });
  });

  it("без аргументу — section порожній рядок (відкрити Settings без скролу)", () => {
    openHubSettingsSection();
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail.section).toBe("");
  });

  it("не диспатчить для невалідної section", () => {
    openHubSettingsSection("not-a-real-section");
    expect(listener).not.toHaveBeenCalled();
  });
});

// Audit finding #5 (2026-08-08): `VALID_SETTINGS_SECTIONS` used to be a
// FOURTH hand-maintained id list, independent of `SETTINGS_SECTIONS_
// CATALOG` — it carried the same two ghost ids ("general", "assistant")
// the L-13 audit found and merged elsewhere, and was missing three real
// section ids ("plan", "capabilities", "feedback"), so
// `openHubSettingsSection("plan")` silently no-op'd without even
// dispatching the event. It now derives from the catalog; this pins that
// every real section is reachable and the known ghosts stay gone.
describe("openHubSettingsSection ↔ SETTINGS_SECTIONS_CATALOG parity", () => {
  let listener: EventSpy;

  beforeEach(() => {
    listener = vi.fn<(event: Event) => void>();
    window.addEventListener(HUB_OPEN_SETTINGS_EVENT, listener);
  });
  afterEach(() => {
    window.removeEventListener(HUB_OPEN_SETTINGS_EVENT, listener);
  });

  it("dispatches for every real settings section id in the catalog", () => {
    for (const { id } of SETTINGS_SECTIONS_CATALOG) {
      listener.mockClear();
      openHubSettingsSection(id);
      expect(listener).toHaveBeenCalledTimes(1);
    }
  });

  it("previously-missing sections ('plan', 'capabilities', 'feedback') now dispatch", () => {
    for (const id of ["plan", "capabilities", "feedback"]) {
      openHubSettingsSection(id);
    }
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("previously-ghost ids ('general', 'assistant') still do not dispatch", () => {
    openHubSettingsSection("general");
    openHubSettingsSection("assistant");
    expect(listener).not.toHaveBeenCalled();
  });
});
