import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RELEASES, pickRelease } from "./releases";

const ID_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ITEM_KINDS = new Set(["feature", "fix", "improvement"]);

describe("whatsNew/releases — schema gates", () => {
  it("has at least one release entry", () => {
    expect(RELEASES.length).toBeGreaterThan(0);
  });

  it("uses sortable ISO-date-prefixed slugs as id", () => {
    for (const r of RELEASES) {
      expect(r.id, `id "${r.id}" must match YYYY-MM-DD-<slug>`).toMatch(ID_RE);
      expect(r.id.startsWith(r.date), `${r.id} must start with ${r.date}`).toBe(
        true,
      );
    }
  });

  it("keeps id values unique", () => {
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses ISO-8601 (YYYY-MM-DD) date strings", () => {
    for (const r of RELEASES) {
      expect(r.date).toMatch(DATE_RE);
      const ts = Date.parse(`${r.date}T00:00:00Z`);
      expect(Number.isFinite(ts)).toBe(true);
    }
  });

  it("orders releases newest first (sort by id descending)", () => {
    const sorted = [...RELEASES]
      .map((r) => r.id)
      .sort((a, b) => b.localeCompare(a));
    expect(RELEASES.map((r) => r.id)).toEqual(sorted);
  });

  it("populates non-empty title / summary / items[]", () => {
    for (const r of RELEASES) {
      expect(r.title.trim().length).toBeGreaterThan(0);
      expect(r.summary.trim().length).toBeGreaterThan(0);
      expect(r.items.length).toBeGreaterThan(0);
    }
  });

  it("restricts item.kind to feature | fix | improvement", () => {
    for (const r of RELEASES) {
      for (const item of r.items) {
        expect(ITEM_KINDS.has(item.kind)).toBe(true);
        expect(item.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("CTA href is a path (/…) or external https URL", () => {
    for (const r of RELEASES) {
      if (!r.cta) continue;
      expect(r.cta.label.trim().length).toBeGreaterThan(0);
      const href = r.cta.href;
      const ok =
        href.startsWith("/") ||
        /^https?:\/\//i.test(href) ||
        href.startsWith("mailto:");
      expect(ok, `cta.href "${href}" must be path or external URL`).toBe(true);
    }
  });

  it("has matching markdown source in docs/whats-new/<id>.md", () => {
    // process.cwd() === apps/web during vitest run; resolve repo root upward.
    const repoRoot = resolve(process.cwd(), "..", "..");
    for (const r of RELEASES) {
      const expected = resolve(
        repoRoot,
        "docs",
        "01-product",
        "whats-new",
        `${r.id}.md`,
      );
      expect(
        existsSync(expected),
        `markdown source missing: docs/01-product/whats-new/${r.id}.md`,
      ).toBe(true);
      // Sanity: markdown file mentions the same id (caught typo guard).
      const md = readFileSync(expected, "utf8");
      expect(
        md.includes(r.id),
        `markdown for ${r.id} must reference its id`,
      ).toBe(true);
    }
  });
});

describe("whatsNew/releases — pickRelease", () => {
  it("returns the latest release when nothing seen yet", () => {
    const picked = pickRelease(null);
    expect(picked).not.toBeNull();
    expect(picked?.id).toBe(RELEASES[0]?.id);
  });

  it("returns null when latest already seen", () => {
    const latest = RELEASES[0];
    if (!latest) throw new Error("releases.ts must export at least one entry");
    expect(pickRelease(latest.id)).toBeNull();
  });

  it("returns the latest when an older id was seen", () => {
    const stale = "1999-01-01-not-a-real-release";
    const picked = pickRelease(stale);
    expect(picked?.id).toBe(RELEASES[0]?.id);
  });

  // Ядро фікса browser-QA 2026-09-02: ноти написані для того, хто був тут
  // минулого разу («порція за вашими репортами»), тож акаунту, створеному
  // ПІСЛЯ релізу, вони брешуть про спільне минуле.
  it("не показує реліз, старший за сам акаунт", () => {
    const latest = RELEASES[0];
    if (!latest) throw new Error("releases.ts must export at least one entry");
    // Акаунт старший за реліз → ноти справді нові для нього.
    expect(pickRelease(null, "2020-01-01T10:00:00.000Z")?.id).toBe(latest.id);
    // Акаунт молодший → мовчимо.
    expect(pickRelease(null, "2099-01-01T10:00:00.000Z")).toBeNull();
  });

  it("лишає реліз, випущений у день реєстрації", () => {
    const latest = RELEASES[0];
    if (!latest) throw new Error("releases.ts must export at least one entry");
    // Полудень за Києвом того ж календарного дня — день-ключ збігається.
    const sameDay = `${latest.date}T09:00:00.000Z`;
    expect(pickRelease(null, sameDay)?.id).toBe(latest.id);
  });

  it("не гейтить, коли дата акаунта невідома або зіпсована", () => {
    expect(pickRelease(null)?.id).toBe(RELEASES[0]?.id);
    expect(pickRelease(null, null)?.id).toBe(RELEASES[0]?.id);
    expect(pickRelease(null, "не-дата")?.id).toBe(RELEASES[0]?.id);
  });

  // Побачив модал раніше → він уже повертається, і вік акаунта більше не
  // має значення: інакше нові ноти не доїхали б до нього ніколи.
  it("не гейтить того, хто вже бачив попередній реліз", () => {
    expect(
      pickRelease("2026-05-06-cold-start", "2099-01-01T10:00:00.000Z")?.id,
    ).toBe(RELEASES[0]?.id);
  });
});
