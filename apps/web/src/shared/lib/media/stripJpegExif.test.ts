// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  MARKER_APP1,
  readExifOrientation,
  stripJpegApp1,
  stripJpegExif,
} from "./stripJpegExif";

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

function segment(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
}

/** EXIF APP1 (big-endian TIFF): Orientation + фіктивний GPS-вказівник. */
function exifApp1(orientation: number | null, little = false): number[] {
  const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) =>
    little
      ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24]
      : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  const entries: number[][] = [];
  if (orientation !== null) {
    entries.push([
      ...u16(0x0112),
      ...u16(3),
      ...u32(1),
      ...u16(orientation),
      0,
      0,
    ]);
  }
  // GPSInfo IFD pointer (0x8825) — у реальному файлі веде на координати.
  entries.push([...u16(0x8825), ...u16(4), ...u32(1), ...u32(0x1234)]);
  const tiff = [
    ...ascii(little ? "II" : "MM"),
    ...u16(0x2a),
    ...u32(8),
    ...u16(entries.length),
    ...entries.flat(),
    ...u32(0),
    ...ascii("GPS 50.4501N 30.5234E"),
  ];
  return segment(MARKER_APP1, [...ascii("Exif"), 0, 0, ...tiff]);
}

function jpeg(...app: number[][]): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...app.flat(),
    ...segment(0xdb, [0, ...new Array(64).fill(1)]),
    ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
    0x12,
    0xff,
    0x00,
    0x34,
    0xff,
    0xd0,
    0x56,
    0xff,
    0xd9,
  ]);
}

function hasMarker(bytes: Uint8Array, marker: number): boolean {
  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === marker) return true;
  }
  return false;
}

function includesAscii(bytes: Uint8Array, text: string): boolean {
  return new TextDecoder("latin1").decode(bytes).includes(text);
}

describe("stripJpegApp1", () => {
  it("вирізає EXIF і XMP APP1, лишаючи решту сегментів і скан без змін", () => {
    const xmp = segment(MARKER_APP1, [
      ...ascii("http://ns.adobe.com/xap/1.0/\0"),
      ...ascii("<exif:GPSLatitude>50,27.0N</exif:GPSLatitude>"),
    ]);
    const input = jpeg(exifApp1(null), xmp);
    const out = stripJpegApp1(input);

    expect(out).not.toBeNull();
    expect(hasMarker(out!, MARKER_APP1)).toBe(false);
    expect(includesAscii(out!, "GPS")).toBe(false);
    expect(includesAscii(out!, "JFIF")).toBe(true);
    const tail = input.subarray(input.indexOf(0xda) - 1);
    expect(Array.from(out!.subarray(out!.length - tail.length))).toEqual(
      Array.from(tail),
    );
  });

  it.each([false, true])(
    "зберігає поворот 6 мінімальним EXIF без GPS (little-endian: %s)",
    (little) => {
      const out = stripJpegApp1(jpeg(exifApp1(6, little)));

      expect(out).not.toBeNull();
      expect(includesAscii(out!, "GPS")).toBe(false);
      const at = out!.findIndex(
        (b, i) => b === 0xff && out![i + 1] === MARKER_APP1,
      );
      expect(at).toBeGreaterThan(0);
      expect(readExifOrientation(out!, at + 4, at + 2 + 0x22)).toBe(6);
    },
  );

  it("не вставляє EXIF для орієнтації 1", () => {
    const out = stripJpegApp1(jpeg(exifApp1(1)));
    expect(out).not.toBeNull();
    expect(hasMarker(out!, MARKER_APP1)).toBe(false);
  });

  it("повертає null, коли вирізати нічого, файл не JPEG або сегмент битий", () => {
    expect(stripJpegApp1(jpeg())).toBeNull();
    expect(stripJpegApp1(new Uint8Array(10))).toBeNull();
    const broken = jpeg(exifApp1(null)).subarray(0, 30);
    expect(stripJpegApp1(broken)).toBeNull();
  });
});

describe("stripJpegExif", () => {
  it("повертає JPEG-файл без EXIF з тим самим іменем", async () => {
    const file = new File([jpeg(exifApp1(null))], "receipt.jpg", {
      type: "image/jpeg",
    });
    const out = await stripJpegExif(file);

    expect(out).toMatchObject({ name: "receipt.jpg", type: "image/jpeg" });
    const bytes = new Uint8Array(await out!.arrayBuffer());
    expect(hasMarker(bytes, MARKER_APP1)).toBe(false);
  });

  it("не чіпає PNG", async () => {
    const file = new File([jpeg(exifApp1(null))], "a.png", {
      type: "image/png",
    });
    await expect(stripJpegExif(file)).resolves.toBeNull();
  });
});
