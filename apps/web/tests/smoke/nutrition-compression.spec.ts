import { expect, test } from "@playwright/test";
import { seedFTUX } from "../utils/seedFTUX";
import { collectPageErrors, waitForInitialSqliteRefresh } from "./smokeHelpers";

// Actual image decoding, canvas scaling and JPEG encoding through the meal UI.
// Only the external AI-analysis boundary is replaced; no provider request/cost.
test("@critical nutrition: a wide uploaded image becomes a 2048px JPEG before AI analysis", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedFTUX(page, "post-ftux");
  const errors = await collectPageErrors(page);
  let uploads = 0;
  await page.route("**/api/v1/nutrition/analyze-photo", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    uploads += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": new URL(page.url()).origin,
        "access-control-allow-credentials": "true",
      },
      body: JSON.stringify({ error: "Synthetic AI boundary is unavailable" }),
    });
  });
  await page.goto("/nutrition", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "nutrition");
  await page
    .getByTestId("corner-action")
    .getByRole("button", { name: "Додати" })
    .click();
  await page
    .getByTestId("add-sources")
    .getByRole("button", { name: /^Фото/ })
    .click();
  const sheet = page.getByRole("dialog", { name: "Додати прийом їжі" });
  await expect(sheet).toBeVisible();
  const request = page.waitForRequest(
    (r) =>
      r.method() === "POST" &&
      new URL(r.url()).pathname === "/api/v1/nutrition/analyze-photo",
  );
  await sheet.locator('input[type="file"]').setInputFiles({
    name: "wide-food.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="2048"><rect width="4096" height="2048" fill="green"/></svg>',
    ),
  });
  const preview = sheet.getByAltText("Обране фото");
  await expect(preview).toBeVisible();
  expect(uploads).toBe(0);
  // Respect the real first-photo privacy acknowledgement before any upload.
  await sheet.getByRole("button", { name: /^Зрозуміло/ }).click();
  const payload = (await request).postDataJSON() as {
    image_base64: string;
    mime_type: string;
    locale: string;
  };
  expect(payload.mime_type).toBe("image/jpeg");
  expect(payload.locale).toBe("uk-UA");
  expect([
    ...Buffer.from(payload.image_base64, "base64").subarray(0, 3),
  ]).toEqual([255, 216, 255]);
  const dimensions = await page.evaluate(async (base64) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Transport payload is not a decodable JPEG"));
      image.src = `data:image/jpeg;base64,${base64}`;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, payload.image_base64);
  expect(dimensions).toEqual({ width: 2048, height: 1024 });
  expect(errors).toEqual([]);
});
