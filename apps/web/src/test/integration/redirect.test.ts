import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * PR-25 (stack-pulse-2026-05) single-origin slice. The historic
 * `fizruk.vercel.app` origin must 301-redirect to the canonical
 * `sergeant.vercel.app`, preserving path + query. Vercel emits a 301 for a
 * redirect rule with `permanent: true`, so we assert the declarative rule in
 * `apps/web/vercel.json` (Vercel's Root Directory is `apps/web`, so this is
 * the only config it reads — see `vercelOutputConfig.test.ts`).
 *
 * This is the NON-breaking PR-1 slice: the redirect is additive. Dropping
 * `fizruk.vercel.app` from the CORS / OAuth allowlists is the deferred PR-2
 * and is explicitly out of scope here.
 */

type VercelRedirect = {
  source: string;
  has?: Array<{ type: string; value: string }>;
  destination: string;
  permanent?: boolean;
};

function readVercelConfig(): { redirects?: VercelRedirect[] } {
  const path = resolve(process.cwd(), "vercel.json");
  return JSON.parse(readFileSync(path, "utf8")) as {
    redirects?: VercelRedirect[];
  };
}

describe("vercel.json — fizruk → sergeant single-origin redirect (PR-25)", () => {
  it("declares a 301 redirect from fizruk.vercel.app to sergeant.vercel.app", () => {
    const config = readVercelConfig();

    const redirect = config.redirects?.find((rule) =>
      rule.has?.some(
        (condition) =>
          condition.type === "host" && condition.value === "fizruk.vercel.app",
      ),
    );

    expect(redirect).toBeDefined();
    // `permanent: true` is Vercel's contract for an HTTP 301 (vs 307 when false).
    expect(redirect?.permanent).toBe(true);
    expect(redirect?.destination).toBe("https://sergeant.vercel.app/:path*");
  });

  it("preserves the request path via the `:path*` segment", () => {
    const config = readVercelConfig();

    const redirect = config.redirects?.find((rule) =>
      rule.has?.some(
        (condition) =>
          condition.type === "host" && condition.value === "fizruk.vercel.app",
      ),
    );

    // Source captures the full path; destination re-emits it under the
    // canonical origin so deep links survive the redirect (query is preserved
    // by Vercel automatically). A wildcard-less destination would flatten every
    // path to the origin root — guard against that regression.
    expect(redirect?.source).toBe("/:path*");
    expect(redirect?.destination).toContain(":path*");
  });

  it("scopes the redirect to the fizruk host only (no blanket redirect)", () => {
    const config = readVercelConfig();

    const fizrukRedirect = config.redirects?.find((rule) =>
      rule.has?.some(
        (condition) =>
          condition.type === "host" && condition.value === "fizruk.vercel.app",
      ),
    );

    // The redirect MUST carry a host condition — an unconditional `/:path*`
    // redirect would 301 sergeant.vercel.app onto itself and loop.
    expect(fizrukRedirect?.has).toBeDefined();
    expect(fizrukRedirect?.has?.length).toBeGreaterThan(0);
  });
});
