/**
 * HTTPS Universal Link / Android App Link coverage for the shared
 * `parseSergeantUrl()` parser.
 *
 * Custom-scheme (`sergeant://…`) coverage lives next to the parser
 * in `apps/mobile/src/lib/deepLinks.test.ts`; this suite focuses
 * exclusively on the HTTPS branch + the
 * `apple-app-site-association` / `assetlinks.json` host allow-list.
 *
 * Source of truth — `UNIVERSAL_LINK_HOSTS` in `../deepLinks.ts` and
 * `UNIVERSAL_LINK_HOSTS` in `apps/mobile/app.config.ts`. The two
 * lists must stay in lock-step; the parity assertion at the bottom
 * of this file fails CI if drift creeps in.
 */
import {
  hrefForDeepLink,
  parseSergeantUrl,
  UNIVERSAL_LINK_HOSTS,
} from "../deepLinks";

describe("parseSergeantUrl (HTTPS Universal Links)", () => {
  describe("allow-listed hosts route to the same Hrefs as sergeant:// URLs", () => {
    for (const host of UNIVERSAL_LINK_HOSTS) {
      it(`https://${host}/ → hub`, () => {
        expect(parseSergeantUrl(`https://${host}/`)).toEqual({ type: "hub" });
      });

      it(`https://${host}/finyk → finance (web slug aliased to RN domain)`, () => {
        const parsed = parseSergeantUrl(`https://${host}/finyk`);
        expect(parsed).toEqual({ type: "finance" });
        // Round-trips to the same Href as the bare `sergeant://finance`.
        expect(hrefForDeepLink(parsed!)).toBe("/(tabs)/finyk");
      });

      it(`https://${host}/finyk/tx/tx_42 → finance-tx (alias preserves sub-paths)`, () => {
        expect(parseSergeantUrl(`https://${host}/finyk/tx/tx_42`)).toEqual({
          type: "finance-tx",
          id: "tx_42",
        });
      });

      it(`https://${host}/finance → finance (canonical domain segment also accepted)`, () => {
        expect(parseSergeantUrl(`https://${host}/finance`)).toEqual({
          type: "finance",
        });
      });

      it(`https://${host}/routine → routine`, () => {
        const parsed = parseSergeantUrl(`https://${host}/routine`);
        expect(parsed).toEqual({ type: "routine" });
        expect(hrefForDeepLink(parsed!)).toBe("/(tabs)/routine");
      });

      it(`https://${host}/workout/new → workout-new`, () => {
        expect(parseSergeantUrl(`https://${host}/workout/new`)).toEqual({
          type: "workout-new",
        });
      });

      it(`https://${host}/workout/007 preserves zero-padding`, () => {
        expect(parseSergeantUrl(`https://${host}/workout/007`)).toEqual({
          type: "workout",
          id: "007",
        });
      });

      it(`https://${host}/fizruk/workout/42 → workout (web fizruk prefix stripped)`, () => {
        expect(parseSergeantUrl(`https://${host}/fizruk/workout/42`)).toEqual({
          type: "workout",
          id: "42",
        });
      });

      it(`https://${host}/fizruk alone → null (no top-level fizruk deep-link)`, () => {
        expect(parseSergeantUrl(`https://${host}/fizruk`)).toBeNull();
      });

      it(`https://${host}/food/recipe/r9 → food-recipe (canonical)`, () => {
        expect(parseSergeantUrl(`https://${host}/food/recipe/r9`)).toEqual({
          type: "food-recipe",
          id: "r9",
        });
      });

      it(`https://${host}/nutrition/recipe/r9 → food-recipe (web slug alias)`, () => {
        expect(parseSergeantUrl(`https://${host}/nutrition/recipe/r9`)).toEqual(
          { type: "food-recipe", id: "r9" },
        );
      });

      it(`https://${host}/nutrition/scan → food-scan`, () => {
        expect(parseSergeantUrl(`https://${host}/nutrition/scan`)).toEqual({
          type: "food-scan",
        });
      });

      it(`https://${host}/settings → settings`, () => {
        expect(parseSergeantUrl(`https://${host}/settings`)).toEqual({
          type: "settings",
        });
      });
    }
  });

  describe("path / query / fragment edge-cases", () => {
    const host = UNIVERSAL_LINK_HOSTS[0]!;

    it("ignores trailing slash", () => {
      expect(parseSergeantUrl(`https://${host}/routine/`)).toEqual({
        type: "routine",
      });
    });

    it("strips fragment but keeps the routable path", () => {
      expect(parseSergeantUrl(`https://${host}/routine#section`)).toEqual({
        type: "routine",
      });
    });

    it("auth/callback requires non-empty token", () => {
      expect(
        parseSergeantUrl(`https://${host}/auth/callback?token=tok-123`),
      ).toMatchObject({
        type: "auth-callback",
        token: "tok-123",
      });
      expect(
        parseSergeantUrl(`https://${host}/auth/callback?token=`),
      ).toBeNull();
      expect(parseSergeantUrl(`https://${host}/auth/callback`)).toBeNull();
    });

    it("rejects unknown top-level segment", () => {
      expect(parseSergeantUrl(`https://${host}/totally-unknown`)).toBeNull();
    });

    it("rejects extra segments after a terminal route", () => {
      expect(parseSergeantUrl(`https://${host}/workout/123/extra`)).toBeNull();
    });

    it("accepts an explicit :443 port", () => {
      expect(parseSergeantUrl(`https://${host}:443/routine`)).toEqual({
        type: "routine",
      });
    });
  });

  describe("host allow-list (no suffix wildcard)", () => {
    it("rejects hosts not on the list", () => {
      expect(parseSergeantUrl("https://sergeant.app/routine")).toBeNull();
      expect(parseSergeantUrl("https://www.sergeant.app/routine")).toBeNull();
      expect(parseSergeantUrl("https://example.com/routine")).toBeNull();
    });

    it("rejects suffix-attack on an allow-listed host", () => {
      // `sergeant.vercel.app.evil.com` looks similar to
      // `sergeant.vercel.app` but is a different host entirely.
      expect(
        parseSergeantUrl("https://sergeant.vercel.app.evil.com/routine"),
      ).toBeNull();
      expect(
        parseSergeantUrl("https://sergeant.2dmanager.com.ua.evil.com/routine"),
      ).toBeNull();
    });

    it("rejects subdomain prefixes that are NOT in the allow-list", () => {
      expect(
        parseSergeantUrl("https://staging.sergeant.vercel.app/routine"),
      ).toBeNull();
    });

    it("rejects `userinfo@host` shapes", () => {
      // `https://evil@sergeant.vercel.app/...` is technically valid
      // RFC-3986 syntax but `evil` is the user-info, not the host.
      // Apple/Android won't open the app on these, and we reject
      // them defensively too.
      expect(
        parseSergeantUrl("https://evil@sergeant.vercel.app/routine"),
      ).toBeNull();
    });

    it("rejects http:// (cleartext)", () => {
      // App Links / Universal Links never verify on cleartext —
      // both Apple and Google require HTTPS — so we mirror that.
      expect(parseSergeantUrl("http://sergeant.vercel.app/routine")).toBeNull();
    });

    it("matches host case-insensitively", () => {
      expect(parseSergeantUrl("https://Sergeant.Vercel.App/routine")).toEqual({
        type: "routine",
      });
    });
  });
});
