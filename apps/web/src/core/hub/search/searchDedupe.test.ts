/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { ASSISTANT_CAPABILITIES } from "@sergeant/shared";
import { canonicalHitKey, dedupeHits } from "./searchDedupe";
import { performSearch } from "./searchSources";
import type { Hit } from "./searchTypes";

function getAssistantCapability(id: string) {
  const capability = ASSISTANT_CAPABILITIES.find((c) => c.id === id);
  if (!capability) throw new Error(`немає можливості ${id}`);
  return capability;
}

function hit(partial: Partial<Hit> & Pick<Hit, "id" | "target">): Hit {
  return {
    module: "finyk",
    moduleLabel: "Фінік",
    title: "Запис",
    subtitle: "",
    icon: "credit-card",
    _score: 1,
    ...partial,
  };
}

describe("дедуплікація видачі глобального пошуку", () => {
  it("«Почати тренування» стоїть у видачі один раз, як дія", () => {
    const results = performSearch("тренування");
    const rows = results.filter((r) => r.title === "Почати тренування");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.target.kind).toBe("action");
  });

  it("два джерела з тією самою сутністю дають один рядок, виграє перше", () => {
    const fromMirror = hit({
      id: "finyk_tx_abc",
      title: "Сільпо",
      target: { kind: "module", moduleId: "finyk", path: "/finyk/t?tx=abc" },
    });
    const fromCache = { ...fromMirror, title: "Сільпо (кеш)", _score: 9 };
    const other = hit({
      id: "finyk_tx_def",
      target: { kind: "module", moduleId: "finyk" },
    });
    expect(dedupeHits([fromMirror, other, fromCache])).toEqual([
      fromMirror,
      other,
    ]);
  });

  it("дія і можливість Сержанта з тим самим id мають один ключ", () => {
    const capability = getAssistantCapability("start_workout");
    const action = hit({
      id: "action_start_workout",
      target: { kind: "action", moduleId: "fizruk", action: "start_workout" },
    });
    const assistant = hit({
      id: "assistant_start_workout",
      module: "assistant",
      target: { kind: "assistant", capability },
    });
    expect(canonicalHitKey(action)).toBe(canonicalHitKey(assistant));
  });

  it("різні команди не зливаються", () => {
    const capability = getAssistantCapability("finish_workout");
    const action = hit({
      id: "action_start_workout",
      target: { kind: "action", moduleId: "fizruk", action: "start_workout" },
    });
    const assistant = hit({
      id: "assistant_finish_workout",
      module: "assistant",
      target: { kind: "assistant", capability },
    });
    expect(dedupeHits([action, assistant])).toHaveLength(2);
  });
});
