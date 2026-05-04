import { describe, expect, it } from "vitest";

import {
  buildFtuxDripTemplate,
  FTUX_DRIP_CAMPAIGN_KEY,
  FTUX_DRIP_DELAY_MS,
} from "./ftuxDripCopy.js";

describe("FTUX drip copy", () => {
  const baseInput = {
    recipientName: "Дмитро",
    unsubscribeUrl: "https://app.sergeant.fit/api/email/unsubscribe?u=tok",
    appUrl: "https://app.sergeant.fit",
  };

  it("Day 0 містить ім'я, CTA на додаток і unsubscribe-link у text та html", () => {
    const tpl = buildFtuxDripTemplate("day_0", baseInput);
    expect(tpl.subject.length).toBeGreaterThan(0);
    expect(tpl.text).toContain("Дмитро");
    expect(tpl.text).toContain(baseInput.appUrl);
    expect(tpl.text).toContain(baseInput.unsubscribeUrl);
    expect(tpl.html).toContain(baseInput.unsubscribeUrl);
    // Унікнути plaintext-leak: HTML має HTML-теги, не лише текст.
    expect(tpl.html).toMatch(/<\/?\w+/);
  });

  it("Day 1 і Day 3 теж надсилають unsubscribe + appUrl", () => {
    for (const day of ["day_1", "day_3"] as const) {
      const tpl = buildFtuxDripTemplate(day, baseInput);
      expect(tpl.subject).not.toEqual(
        buildFtuxDripTemplate("day_0", baseInput).subject,
      );
      expect(tpl.text).toContain(baseInput.unsubscribeUrl);
      expect(tpl.html).toContain(baseInput.unsubscribeUrl);
    }
  });

  it("без імені (recipientName=null) рендерить нейтральне привітання", () => {
    const tpl = buildFtuxDripTemplate("day_0", {
      ...baseInput,
      recipientName: null,
    });
    expect(tpl.text).not.toContain("Дмитро");
    // Текст має лишатись непустим
    expect(tpl.text.length).toBeGreaterThan(40);
  });

  it("HTML escape: ім'я з спецсимволами не ламає розмітку", () => {
    const tpl = buildFtuxDripTemplate("day_0", {
      ...baseInput,
      recipientName: 'Алекс<script>alert("x")</script>',
    });
    expect(tpl.html).not.toContain("<script>");
    expect(tpl.html).toContain("&lt;script&gt;");
  });

  it("campaign_key мапиться 1:1 на день", () => {
    expect(FTUX_DRIP_CAMPAIGN_KEY.day_0).toBe("ftux_drip_day_0");
    expect(FTUX_DRIP_CAMPAIGN_KEY.day_1).toBe("ftux_drip_day_1");
    expect(FTUX_DRIP_CAMPAIGN_KEY.day_3).toBe("ftux_drip_day_3");
  });

  it("delay-ms відповідають специфікації (0 / 24h / 72h)", () => {
    expect(FTUX_DRIP_DELAY_MS.day_0).toBe(0);
    expect(FTUX_DRIP_DELAY_MS.day_1).toBe(24 * 60 * 60 * 1000);
    expect(FTUX_DRIP_DELAY_MS.day_3).toBe(72 * 60 * 60 * 1000);
  });
});
