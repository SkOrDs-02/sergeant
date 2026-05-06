import { describe, it, expect } from "vitest";
import { MODULE_LABELS, type HubModuleId } from "./moduleLabels";

// PR-06 — canonical Cyrillic naming sweep. The four module display
// names are the single SSOT for «Фінік / Фізрук / Рутина / Харчування».
// Drift across surfaces (welcome peek, settings, notifications,
// reports) was the visible symptom we observed before PR-06.
describe("MODULE_LABELS — canonical Cyrillic without emoji (PR-06)", () => {
  it("each module exposes the canonical Cyrillic label", () => {
    expect(MODULE_LABELS.finyk).toBe("Фінік");
    expect(MODULE_LABELS.fizruk).toBe("Фізрук");
    expect(MODULE_LABELS.routine).toBe("Рутина");
    expect(MODULE_LABELS.nutrition).toBe("Харчування");
  });

  it("no label leaks an emoji prefix or suffix", () => {
    // The Cyrillic-block range covers Ukrainian letters; we forbid any
    // codepoint outside the Cyrillic-block + space + parenthesis. This
    // is the explicit guardrail that catches future regressions like
    // `"💰 Фінік"` or `"Фінік 💳"` slipping back in.
    const allowed = /^[А-Яа-яЁёІіЇїЄєҐґ \-()]+$/u;
    for (const id of Object.keys(MODULE_LABELS) as HubModuleId[]) {
      expect(MODULE_LABELS[id], `module=${id}`).toMatch(allowed);
    }
  });
});
