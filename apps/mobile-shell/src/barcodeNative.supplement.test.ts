import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Доповнення до `barcodeNative.test.ts` — кейси, яких там немає:
 *   1. `requestPermissions()` повертає `"limited"` → `ensureCameraPermission`
 *      повинна повернути `true` (iOS partial camera access вважається
 *      достатнім для сканування).
 *   2. `scanBarcodeNative` коли `requestPermissions()` повертає `"limited"` →
 *      scan виконується (permission-gate пропускає).
 *
 * Наявний `barcodeNative.test.ts` тестує `"limited"` лише для прямого
 * `checkPermissions()`, але не для шляху `checkPermissions → requestPermissions → "limited"`.
 *
 * Структура моків (`vi.mock`) дзеркалить `barcodeNative.test.ts`.
 */

type CameraPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale"
  | "limited";

type BarcodeFixture = {
  rawValue?: string;
  displayValue?: string;
  format?: string;
  bytes?: number[];
};

const checkPermissions =
  vi.fn<() => Promise<{ camera: CameraPermissionState }>>();
const requestPermissions =
  vi.fn<() => Promise<{ camera: CameraPermissionState }>>();
const scan = vi.fn<() => Promise<{ barcodes: BarcodeFixture[] }>>();

vi.mock("@capacitor-mlkit/barcode-scanning", () => ({
  BarcodeScanner: {
    checkPermissions: () => checkPermissions(),
    requestPermissions: () => requestPermissions(),
    scan: () => scan(),
  },
}));

beforeEach(() => {
  checkPermissions.mockReset();
  requestPermissions.mockReset();
  scan.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ensureCameraPermission — requestPermissions повертає 'limited'", () => {
  it("повертає true, якщо requestPermissions дає 'limited' (prompt → limited → true)", async () => {
    // iOS може повернути `"limited"` після виклику `requestPermissions()`,
    // якщо користувач вибрав «Обмежений доступ». Це достатньо для сканування
    // (сканер отримує потрібний camera-feed), тому `ensureCameraPermission`
    // має трактувати `"limited"` так само, як `"granted"`.
    checkPermissions.mockResolvedValue({ camera: "prompt" });
    requestPermissions.mockResolvedValue({ camera: "limited" });
    const { ensureCameraPermission } = await import("./barcodeNative.js");

    await expect(ensureCameraPermission()).resolves.toBe(true);

    expect(checkPermissions).toHaveBeenCalledTimes(1);
    expect(requestPermissions).toHaveBeenCalledTimes(1);
  });
});

describe("scanBarcodeNative — дозвіл через 'limited' після запиту", () => {
  it("виконує scan якщо requestPermissions повертає 'limited' (permission-gate не блокує)", async () => {
    // Після `checkPermissions → prompt → requestPermissions → limited`
    // `ensureCameraPermission` повертає `true`, і `scanBarcodeNative` має
    // продовжити виконання `BarcodeScanner.scan()`.
    checkPermissions.mockResolvedValue({ camera: "prompt-with-rationale" });
    requestPermissions.mockResolvedValue({ camera: "limited" });
    scan.mockResolvedValue({
      barcodes: [{ rawValue: "UA123456789", format: "CODE_128" }],
    });
    const { scanBarcodeNative } = await import("./barcodeNative.js");

    await expect(scanBarcodeNative()).resolves.toEqual({
      code: "UA123456789",
      format: "CODE_128",
      rawBytes: undefined,
    });

    expect(scan).toHaveBeenCalledTimes(1);
  });
});
