import { describe, expect, it } from "vitest";
import { addMissingBy } from "./restoreMode";

describe("addMissingBy", () => {
  const key = (x: { id: string }) => x.id;

  it("keeps current rows and appends only the ids the file adds", () => {
    const out = addMissingBy(
      [{ id: "a", v: 1 }],
      [
        { id: "a", v: 2 },
        { id: "b", v: 3 },
      ],
      key,
    );
    expect(out).toEqual([
      { id: "a", v: 1 },
      { id: "b", v: 3 },
    ]);
  });

  it("never drops a current row the file does not carry", () => {
    const out = addMissingBy([{ id: "a" }, { id: "z" }], [{ id: "b" }], key);
    expect(out.map((x) => x.id)).toEqual(["a", "z", "b"]);
  });

  it("drops duplicate ids inside the file itself", () => {
    const out = addMissingBy([], [{ id: "a" }, { id: "a" }], key);
    expect(out).toHaveLength(1);
  });
});
