import { describe, expect, it } from "vitest";

import supersetMeta, { Circuit, Superset } from "./SupersetBadge.stories";
import statTileMeta, {
  Default,
  Large,
  Tonnage,
} from "./WorkoutStatTile.stories";

describe("fizruk workout stories", () => {
  it("exports SupersetBadge story metadata and variants", () => {
    expect(supersetMeta.title).toBe("Fizruk / SupersetBadge");
    expect(Superset.args).toEqual({ type: "superset" });
    expect(Circuit.args).toEqual({ type: "circuit" });
  });

  it("exports WorkoutStatTile story metadata and variants", () => {
    expect(statTileMeta.title).toBe("Fizruk / WorkoutStatTile");
    expect(statTileMeta.args).toMatchObject({
      label: "Тривалість",
      value: "42:18",
      size: "sm",
    });
    expect(Default).toEqual({});
    expect(Large.args).toMatchObject({ label: "Вправ", value: "8" });
    expect(Tonnage.args).toMatchObject({
      label: "Тонаж",
      value: "12 480 кг",
    });
  });
});
