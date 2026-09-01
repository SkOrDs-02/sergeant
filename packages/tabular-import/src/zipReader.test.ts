import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { looksLikeZip, readZip, ZipFormatError } from "./zipReader.js";
import { makeZip } from "./__fixtures__/makeXlsx.js";

const HELLO = Buffer.from("привіт", "utf8");

/** Зсув поля `centralDirOffset` усередині EOCD (останні 22 байти). */
function centralOffsetOf(zip: Buffer): number {
  return zip.readUInt32LE(zip.length - 22 + 16);
}

/** Мінімальний архів з одного запису, зібраний вручну — щоб можна було
 * задати будь-які поля заголовків, яких `makeZip` не варіює. */
function handMadeZip(input: {
  name: string;
  payload: Buffer;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
}): Buffer {
  const name = Buffer.from(input.name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(input.method, 8);
  local.writeUInt32LE(input.compressedSize, 18);
  local.writeUInt32LE(input.uncompressedSize, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(input.method, 10);
  central.writeUInt32LE(input.compressedSize, 20);
  central.writeUInt32LE(input.uncompressedSize, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);

  const localPart = Buffer.concat([local, name, input.payload]);
  const centralPart = Buffer.concat([central, name]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, eocd]);
}

describe("looksLikeZip", () => {
  it("впізнає локальний заголовок PK\\x03\\x04", () => {
    expect(looksLikeZip(makeZip([{ name: "a.txt", data: HELLO }]))).toBe(true);
  });

  it("не плутає з довільними байтами", () => {
    expect(looksLikeZip(Buffer.from("не zip", "utf8"))).toBe(false);
    expect(looksLikeZip(Buffer.alloc(2))).toBe(false);
  });
});

describe("readZip", () => {
  it("читає записи за іменем і перелічує їх", () => {
    const zip = readZip(
      makeZip([
        { name: "a.txt", data: HELLO },
        { name: "dir/b.txt", data: Buffer.from("b", "utf8") },
      ]),
    );
    expect(zip.names()).toEqual(["a.txt", "dir/b.txt"]);
    expect(zip.has("a.txt")).toBe(true);
    expect(zip.has("нема.txt")).toBe(false);
    expect(zip.get("a.txt")?.toString("utf8")).toBe("привіт");
    expect(zip.get("нема.txt")).toBeUndefined();
  });

  it("кешує розпаковану частину — другий виклик той самий буфер", () => {
    const zip = readZip(makeZip([{ name: "a.txt", data: HELLO }]));
    expect(zip.get("a.txt")).toBe(zip.get("a.txt"));
  });

  it("читає stored-запис (метод 0), не лише deflate", () => {
    const data = Buffer.from("stored", "utf8");
    const zip = readZip(
      handMadeZip({
        name: "s.txt",
        payload: data,
        method: 0,
        compressedSize: data.length,
        uncompressedSize: data.length,
      }),
    );
    expect(zip.get("s.txt")?.toString("utf8")).toBe("stored");
  });

  it("без EOCD — зрозуміла помилка формату", () => {
    expect(() => readZip(Buffer.from("зовсім не архів", "utf8"))).toThrow(
      ZipFormatError,
    );
  });

  it("Zip64-маркер відкидається явно, а не читається як сміття", () => {
    const zip = makeZip([{ name: "a.txt", data: HELLO }]);
    zip.writeUInt16LE(0xffff, zip.length - 22 + 10);
    expect(() => readZip(zip)).toThrow(/Zip64/);
  });

  it("шифрований запис не інфлейтиться в сміття", () => {
    const zip = makeZip([{ name: "a.txt", data: HELLO }]);
    zip.writeUInt16LE(0x1, centralOffsetOf(zip) + 8);
    expect(() => readZip(zip).get("a.txt")).toThrow(/зашифровано/);
  });

  it("невідомий метод стиснення — помилка з номером методу", () => {
    const zip = makeZip([{ name: "a.txt", data: HELLO }]);
    zip.writeUInt16LE(99, centralOffsetOf(zip) + 10);
    expect(() => readZip(zip).get("a.txt")).toThrow(/метод стиснення 99/);
  });

  it("побитий локальний заголовок ловиться до інфлейту", () => {
    const zip = makeZip([{ name: "a.txt", data: HELLO }]);
    zip.writeUInt32LE(0xdeadbeef, 0);
    expect(() => readZip(zip).get("a.txt")).toThrow(/локальний заголовок/);
  });

  it("побитий центральний каталог ловиться одразу", () => {
    const zip = makeZip([{ name: "a.txt", data: HELLO }]);
    zip.writeUInt32LE(0xdeadbeef, centralOffsetOf(zip));
    expect(() => readZip(zip)).toThrow(/центральний каталог/);
  });

  it("запис, що виходить за межі файлу, не читається", () => {
    const zip = makeZip([{ name: "a.txt", data: HELLO }]);
    zip.writeUInt32LE(0xffff, centralOffsetOf(zip) + 20);
    expect(() => readZip(zip).get("a.txt")).toThrow(/за межі файлу/);
  });

  it("оголошений розмір понад кап відкидається до розпакування", () => {
    // Захист від zip-бомби: кілограм стиснутих нулів, оголошений як 128 МБ.
    const bomb = deflateRawSync(Buffer.alloc(1024));
    expect(() =>
      readZip(
        handMadeZip({
          name: "bomb.bin",
          payload: bomb,
          method: 8,
          compressedSize: bomb.length,
          uncompressedSize: 128 * 1024 * 1024,
        }),
      ).get("bomb.bin"),
    ).toThrow(/завелика/);
  });
});
