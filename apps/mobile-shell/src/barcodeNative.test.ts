import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `barcodeNative.ts` — тонка адаптер-обгортка над
 * `@capacitor-mlkit/barcode-scanning`. Як і у `auth-storage.test.ts`,
 * мокуємо плагін і перевіряємо контракт боундарі: правильні методи
 * викликаються в правильному порядку, дозволи послідовно перевіряються
 * перед `requestPermissions()`, перший знайдений barcode нормалізується
 * у `NativeBarcodeResult`, відсутність barcode → `null`.
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

describe("ensureCameraPermission", () => {
  it("повертає true і НЕ викликає requestPermissions, якщо вже granted", async () => {
    checkPermissions.mockResolvedValue({ camera: "granted" });
    const { ensureCameraPermission } = await import("./barcodeNative.js");

    await expect(ensureCameraPermission()).resolves.toBe(true);

    expect(checkPermissions).toHaveBeenCalledTimes(1);
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("повертає true для 'limited' (iOS partial-photos parity)", async () => {
    checkPermissions.mockResolvedValue({ camera: "limited" });
    const { ensureCameraPermission } = await import("./barcodeNative.js");

    await expect(ensureCameraPermission()).resolves.toBe(true);
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("повертає false і НЕ перепитує, якщо денід (щоб UI вів у системні налаштування)", async () => {
    checkPermissions.mockResolvedValue({ camera: "denied" });
    const { ensureCameraPermission } = await import("./barcodeNative.js");

    await expect(ensureCameraPermission()).resolves.toBe(false);

    expect(checkPermissions).toHaveBeenCalledTimes(1);
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("на 'prompt' викликає requestPermissions і повертає granted-результат", async () => {
    checkPermissions.mockResolvedValue({ camera: "prompt" });
    requestPermissions.mockResolvedValue({ camera: "granted" });
    const { ensureCameraPermission } = await import("./barcodeNative.js");

    await expect(ensureCameraPermission()).resolves.toBe(true);

    expect(checkPermissions).toHaveBeenCalledTimes(1);
    expect(requestPermissions).toHaveBeenCalledTimes(1);
  });

  it("на 'prompt-with-rationale' просить і повертає false, якщо знов денід", async () => {
    checkPermissions.mockResolvedValue({ camera: "prompt-with-rationale" });
    requestPermissions.mockResolvedValue({ camera: "denied" });
    const { ensureCameraPermission } = await import("./barcodeNative.js");

    await expect(ensureCameraPermission()).resolves.toBe(false);
    expect(requestPermissions).toHaveBeenCalledTimes(1);
  });
});

describe("scanBarcodeNative", () => {
  it("кидає 'camera-permission-denied', якщо дозвіл не отримано", async () => {
    checkPermissions.mockResolvedValue({ camera: "denied" });
    const { scanBarcodeNative } = await import("./barcodeNative.js");

    await expect(scanBarcodeNative()).rejects.toThrow(
      "camera-permission-denied",
    );
    expect(scan).not.toHaveBeenCalled();
  });

  it("повертає null, якщо плагін не знайшов жодного штрихкоду", async () => {
    checkPermissions.mockResolvedValue({ camera: "granted" });
    scan.mockResolvedValue({ barcodes: [] });
    const { scanBarcodeNative } = await import("./barcodeNative.js");

    await expect(scanBarcodeNative()).resolves.toBeNull();
  });

  it("нормалізує перший barcode в NativeBarcodeResult із rawValue + format", async () => {
    checkPermissions.mockResolvedValue({ camera: "granted" });
    scan.mockResolvedValue({
      barcodes: [
        { rawValue: "4820000000000", format: "EAN_13" },
        { rawValue: "ignored", format: "QR_CODE" },
      ],
    });
    const { scanBarcodeNative } = await import("./barcodeNative.js");

    await expect(scanBarcodeNative()).resolves.toEqual({
      code: "4820000000000",
      format: "EAN_13",
      rawBytes: undefined,
    });
  });

  it("робить fallback на displayValue, коли rawValue відсутнє", async () => {
    checkPermissions.mockResolvedValue({ camera: "granted" });
    scan.mockResolvedValue({
      barcodes: [{ displayValue: "https://example.com", format: "QR_CODE" }],
    });
    const { scanBarcodeNative } = await import("./barcodeNative.js");

    await expect(scanBarcodeNative()).resolves.toEqual({
      code: "https://example.com",
      format: "QR_CODE",
      rawBytes: undefined,
    });
  });

  it("обгортає bytes у Uint8Array, коли плагін повернув raw-payload", async () => {
    checkPermissions.mockResolvedValue({ camera: "granted" });
    scan.mockResolvedValue({
      barcodes: [{ rawValue: "X", format: "PDF_417", bytes: [0xde, 0xad] }],
    });
    const { scanBarcodeNative } = await import("./barcodeNative.js");

    const result = await scanBarcodeNative();
    expect(result?.rawBytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(result?.rawBytes ?? [])).toEqual([0xde, 0xad]);
  });

  it("нормалізує відсутні rawValue + displayValue у порожній рядок", async () => {
    checkPermissions.mockResolvedValue({ camera: "granted" });
    scan.mockResolvedValue({ barcodes: [{ format: "EAN_13" }] });
    const { scanBarcodeNative } = await import("./barcodeNative.js");

    await expect(scanBarcodeNative()).resolves.toEqual({
      code: "",
      format: "EAN_13",
      rawBytes: undefined,
    });
  });

  it("пробрасує помилку плагіна `scan()`", async () => {
    checkPermissions.mockResolvedValue({ camera: "granted" });
    scan.mockRejectedValue(new Error("scanner-unavailable"));
    const { scanBarcodeNative } = await import("./barcodeNative.js");

    await expect(scanBarcodeNative()).rejects.toThrow("scanner-unavailable");
  });
});
