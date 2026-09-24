import { describe, expect, it } from "vitest";

import { replaceLongDash } from "./modelText.js";

describe("replaceLongDash", () => {
  it("замінює кожне довге тире на коротке і не чіпає решту", () => {
    expect(replaceLongDash("Витрати — 1200 грн, дохід—900.")).toBe(
      "Витрати – 1200 грн, дохід–900.",
    );
  });

  it("текст без довгого тире лишає як є, включно з дефісом і коротким тире", () => {
    const text = "Тиждень 1-7 вересня – без змін.";
    expect(replaceLongDash(text)).toBe(text);
  });
});
