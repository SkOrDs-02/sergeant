// @vitest-environment jsdom
/**
 * Integration test (T-7): component + hook + MSW.
 *
 * Last validated: 2026-06-15
 * Status: Active
 *
 * A scan-button component calls `useBarcodeProductLookup().lookup(code)`, which
 * hits `GET /api/v1/barcode?barcode=…` (the api-client prefix-rewrites
 * `/api/barcode` → `/api/v1/barcode` in tests). A *real* MSW handler serves the
 * Open-Food-Facts–shaped envelope, so the whole client path runs end-to-end:
 * HTTP client → `barcodeApi.lookup` → `fetchQuery` keyed via
 * `nutritionKeys.barcode(code)` → rendered product name. The 404 branch asserts
 * an unknown barcode renders the "not found" empty state rather than throwing.
 *
 * Per-test handlers via `server.use(...)`; `server.resetHandlers()` in
 * `src/test/setup.ts` isolates suites (T-7 risk note on handler leak).
 */
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { useState, type ReactNode } from "react";
import { server } from "../../../test/msw/server";
import { useBarcodeProductLookup } from "./useBarcodeProduct";

const OFF_PRODUCT = {
  name: "Йогурт натуральний",
  brand: "Галичина",
  kcal_100g: 60,
  protein_100g: 5,
  fat_100g: 3.2,
  carbs_100g: 4,
  servingSize: null,
  servingGrams: null,
  source: "off" as const,
};

function ScanProbe({ code }: { code: string }) {
  const lookup = useBarcodeProductLookup();
  const [label, setLabel] = useState("idle");

  async function onScan() {
    try {
      const product = await lookup(code);
      setLabel(product ? product.name : "not-found");
    } catch {
      setLabel("error");
    }
  }

  return (
    <div>
      <button type="button" onClick={onScan}>
        scan
      </button>
      <span data-testid="result">{label}</span>
    </div>
  );
}

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

describe("barcode scan · component + hook + MSW", () => {
  it("renders the product name returned over the wire", async () => {
    server.use(
      http.get("*/api/v1/barcode", () =>
        HttpResponse.json({ product: OFF_PRODUCT }),
      ),
    );

    renderWithClient(<ScanProbe code="4820000000001" />);

    fireEvent.click(screen.getByRole("button", { name: "scan" }));

    await waitFor(() =>
      expect(screen.getByTestId("result")).toHaveTextContent(
        "Йогурт натуральний",
      ),
    );
  });

  it("renders the not-found state for an unknown barcode (404 → null)", async () => {
    server.use(
      http.get("*/api/v1/barcode", () =>
        HttpResponse.json({ error: "not found" }, { status: 404 }),
      ),
    );

    renderWithClient(<ScanProbe code="0000000000000" />);

    fireEvent.click(screen.getByRole("button", { name: "scan" }));

    await waitFor(() =>
      expect(screen.getByTestId("result")).toHaveTextContent("not-found"),
    );
  });
});
