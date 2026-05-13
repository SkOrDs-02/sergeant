/**
 * Unit coverage for the pure `sergeant://` deep-link parser/builder.
 *
 * Each `parseSergeantUrl` case below maps onto the scheme table in
 * `docs/mobile/overview.md`; if a new scheme lands there it must grow a test
 * here before the runtime wiring in `useDeepLinks.ts` picks it up.
 *
 * Scope: pure string → structured union. Intentionally does NOT
 * mock `expo-router` — `hrefForDeepLink` is exercised via plain
 * object-shape assertions.
 */
import {
  buildSergeantUrl,
  hrefForDeepLink,
  parseSergeantUrl,
  type SergeantDeepLink,
} from "./deepLinks";

describe("parseSergeantUrl", () => {
  describe("hub", () => {
    it("returns hub for bare scheme", () => {
      expect(parseSergeantUrl("sergeant://")).toEqual({ type: "hub" });
    });

    it("normalises trailing slash", () => {
      expect(parseSergeantUrl("sergeant:///")).toEqual({ type: "hub" });
    });
  });

  describe("workout", () => {
    it("parses workout/new (specific before dynamic)", () => {
      expect(parseSergeantUrl("sergeant://workout/new")).toEqual({
        type: "workout-new",
      });
    });

    it("parses workout/{id} with numeric id", () => {
      expect(parseSergeantUrl("sergeant://workout/123")).toEqual({
        type: "workout",
        id: "123",
      });
    });

    it("preserves zero-padded ids", () => {
      expect(parseSergeantUrl("sergeant://workout/007")).toEqual({
        type: "workout",
        id: "007",
      });
    });

    it("preserves uuid ids", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      expect(parseSergeantUrl(`sergeant://workout/${uuid}`)).toEqual({
        type: "workout",
        id: uuid,
      });
    });

    it("rejects extra segments", () => {
      expect(parseSergeantUrl("sergeant://workout/123/extra")).toBeNull();
    });

    it("rejects bare workout without id or 'new'", () => {
      expect(parseSergeantUrl("sergeant://workout")).toBeNull();
    });
  });

  describe("food", () => {
    it("parses food/log", () => {
      expect(parseSergeantUrl("sergeant://food/log")).toEqual({
        type: "food-log",
      });
    });

    it("parses food/scan", () => {
      expect(parseSergeantUrl("sergeant://food/scan")).toEqual({
        type: "food-scan",
      });
    });

    it("parses food/pantry", () => {
      expect(parseSergeantUrl("sergeant://food/pantry")).toEqual({
        type: "food-pantry",
      });
    });

    it("parses food/recipe/{id}", () => {
      expect(parseSergeantUrl("sergeant://food/recipe/abc123")).toEqual({
        type: "food-recipe",
        id: "abc123",
      });
    });

    it("rejects bare food/", () => {
      expect(parseSergeantUrl("sergeant://food")).toBeNull();
    });

    it("rejects food/recipe without id", () => {
      expect(parseSergeantUrl("sergeant://food/recipe")).toBeNull();
    });

    it("rejects unknown food sub-route", () => {
      expect(parseSergeantUrl("sergeant://food/unknown")).toBeNull();
    });
  });

  describe("finance", () => {
    it("parses /finance", () => {
      expect(parseSergeantUrl("sergeant://finance")).toEqual({
        type: "finance",
      });
    });

    it("parses /finance/tx/{id}", () => {
      expect(parseSergeantUrl("sergeant://finance/tx/tx_7")).toEqual({
        type: "finance-tx",
        id: "tx_7",
      });
    });

    it("rejects /finance/tx without id", () => {
      expect(parseSergeantUrl("sergeant://finance/tx")).toBeNull();
    });

    it("rejects unknown finance sub-route", () => {
      expect(parseSergeantUrl("sergeant://finance/budgets")).toBeNull();
    });
  });

  describe("routine", () => {
    it("parses /routine", () => {
      expect(parseSergeantUrl("sergeant://routine")).toEqual({
        type: "routine",
      });
    });

    it("parses /routine/habit/{id}", () => {
      expect(parseSergeantUrl("sergeant://routine/habit/morning-run")).toEqual({
        type: "routine-habit",
        id: "morning-run",
      });
    });

    it("rejects /routine/habit without id", () => {
      expect(parseSergeantUrl("sergeant://routine/habit")).toBeNull();
    });
  });

  describe("settings", () => {
    it("parses /settings", () => {
      expect(parseSergeantUrl("sergeant://settings")).toEqual({
        type: "settings",
      });
    });

    it("rejects /settings/profile (no sub-routes yet)", () => {
      expect(parseSergeantUrl("sergeant://settings/profile")).toBeNull();
    });
  });

  describe("auth/callback", () => {
    it("parses with non-empty token", () => {
      expect(parseSergeantUrl("sergeant://auth/callback?token=abc123")).toEqual(
        {
          type: "auth-callback",
          token: "abc123",
          params: { token: "abc123" },
        },
      );
    });

    it("preserves extra params alongside token", () => {
      const parsed = parseSergeantUrl(
        "sergeant://auth/callback?token=xyz&state=ok&next=%2Fsettings",
      );
      expect(parsed).toEqual({
        type: "auth-callback",
        token: "xyz",
        params: { token: "xyz", state: "ok", next: "/settings" },
      });
    });

    it("decodes percent-encoded tokens", () => {
      expect(
        parseSergeantUrl("sergeant://auth/callback?token=foo%2Bbar%3D%3D"),
      ).toMatchObject({ type: "auth-callback", token: "foo+bar==" });
    });

    it("rejects missing token", () => {
      expect(parseSergeantUrl("sergeant://auth/callback")).toBeNull();
    });

    it("rejects empty token", () => {
      expect(parseSergeantUrl("sergeant://auth/callback?token=")).toBeNull();
    });
  });

  describe("rejects invalid schemes and shapes", () => {
    it.each([
      "",
      "   ",
      // `http://` is never accepted — App Links / Universal Links
      // only verify on HTTPS.
      "http://sergeant.app/routine",
      "http://sergeant.vercel.app/routine",
      // HTTPS host not on the universal-links allow-list.
      "https://sergeant.app/routine",
      "https://evil.com/routine",
      "exp://192.168.0.1:19000/routine",
      "routine",
      "sergeant:/routine",
      "sergeant:routine",
      "SERGEANT://routine",
    ])("returns null for %p", (input) => {
      expect(parseSergeantUrl(input)).toBeNull();
    });

    it("returns null for null/undefined", () => {
      expect(parseSergeantUrl(null)).toBeNull();
      expect(parseSergeantUrl(undefined)).toBeNull();
    });

    it("strips fragment but keeps the routable path", () => {
      expect(parseSergeantUrl("sergeant://routine#section")).toEqual({
        type: "routine",
      });
    });

    it("rejects unknown top-level segment", () => {
      expect(parseSergeantUrl("sergeant://foo")).toBeNull();
    });
  });
});

describe("buildSergeantUrl", () => {
  it("round-trips every non-auth link", () => {
    const cases: SergeantDeepLink[] = [
      { type: "hub" },
      { type: "workout-new" },
      { type: "workout", id: "123" },
      { type: "food-log" },
      { type: "food-scan" },
      { type: "food-pantry" },
      { type: "food-recipe", id: "r1" },
      { type: "finance" },
      { type: "finance-tx", id: "tx_9" },
      { type: "routine" },
      { type: "routine-habit", id: "h1" },
      { type: "settings" },
    ];
    for (const c of cases) {
      const url = buildSergeantUrl(c);
      expect(parseSergeantUrl(url)).toEqual(c);
    }
  });

  it("encodes ids with special characters", () => {
    expect(buildSergeantUrl({ type: "workout", id: "my id/slash" })).toBe(
      "sergeant://workout/my%20id%2Fslash",
    );
  });

  it("round-trips auth-callback including extra params", () => {
    const url = buildSergeantUrl({
      type: "auth-callback",
      token: "tok",
      params: { state: "s1" },
    });
    expect(url).toContain("token=tok");
    expect(url).toContain("state=s1");
    const parsed = parseSergeantUrl(url);
    expect(parsed).toMatchObject({
      type: "auth-callback",
      token: "tok",
      params: { token: "tok", state: "s1" },
    });
  });
});

describe("hrefForDeepLink", () => {
  it("maps simple routes to string Hrefs", () => {
    expect(hrefForDeepLink({ type: "hub" })).toBe("/(tabs)");
    expect(hrefForDeepLink({ type: "finance" })).toBe("/(tabs)/finyk");
    expect(hrefForDeepLink({ type: "routine" })).toBe("/(tabs)/routine");
    expect(hrefForDeepLink({ type: "food-log" })).toBe("/(tabs)/nutrition");
    expect(hrefForDeepLink({ type: "settings" })).toBe("/settings");
    expect(hrefForDeepLink({ type: "workout-new" })).toBe(
      "/(tabs)/fizruk/workout/new",
    );
    expect(hrefForDeepLink({ type: "food-scan" })).toBe(
      "/(tabs)/nutrition/scan",
    );
    expect(hrefForDeepLink({ type: "food-pantry" })).toBe(
      "/(tabs)/nutrition/pantry",
    );
  });

  it("maps dynamic routes to object Hrefs with params", () => {
    expect(hrefForDeepLink({ type: "workout", id: "42" })).toEqual({
      pathname: "/(tabs)/fizruk/workout/[id]",
      params: { id: "42" },
    });
    expect(hrefForDeepLink({ type: "routine-habit", id: "h7" })).toEqual({
      pathname: "/(tabs)/routine/habit/[id]",
      params: { id: "h7" },
    });
    expect(hrefForDeepLink({ type: "finance-tx", id: "tx_3" })).toEqual({
      pathname: "/(tabs)/finyk/tx/[id]",
      params: { id: "tx_3" },
    });
    expect(hrefForDeepLink({ type: "food-recipe", id: "r9" })).toEqual({
      pathname: "/(tabs)/nutrition/recipe/[id]",
      params: { id: "r9" },
    });
  });

  it("returns null for auth-callback (consumed imperatively)", () => {
    expect(
      hrefForDeepLink({
        type: "auth-callback",
        token: "t",
        params: { token: "t" },
      }),
    ).toBeNull();
  });
});
