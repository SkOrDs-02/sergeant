import { deflateRawSync } from "node:zlib";

/**
 * Мінімальний білдер XLSX для тестів `xlsxGrid.ts` / `tabularFile.ts`.
 *
 * WHY він тут, а не бібліотека чи бінарна фікстура: комітити бінарник,
 * який ніхто не може прочитати очима на ревʼю, гірше за код, що будує
 * той самий байт-стрім явно. Заразом білдер - виконуваний опис тієї
 * підмножини OOXML, яку очікує
 * наш ридер.
 */

interface ZipInput {
  name: string;
  data: Buffer;
}

function localHeader(entry: ZipInput, deflated: Buffer): Buffer {
  const name = Buffer.from(entry.name, "utf8");
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4); // version needed
  head.writeUInt16LE(0, 6); // flags
  head.writeUInt16LE(8, 8); // method: deflate
  head.writeUInt32LE(0, 14); // CRC — ридер його не перевіряє (як і zlib)
  head.writeUInt32LE(deflated.length, 18);
  head.writeUInt32LE(entry.data.length, 22);
  head.writeUInt16LE(name.length, 26);
  head.writeUInt16LE(0, 28);
  return Buffer.concat([head, name]);
}

function centralHeader(
  entry: ZipInput,
  deflated: Buffer,
  localOffset: number,
): Buffer {
  const name = Buffer.from(entry.name, "utf8");
  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(20, 6);
  head.writeUInt16LE(0, 8);
  head.writeUInt16LE(8, 10);
  head.writeUInt32LE(0, 16);
  head.writeUInt32LE(deflated.length, 20);
  head.writeUInt32LE(entry.data.length, 24);
  head.writeUInt16LE(name.length, 28);
  head.writeUInt32LE(localOffset, 42);
  return Buffer.concat([head, name]);
}

/** Збирає не-Zip64 ZIP із deflate-записів. */
export function makeZip(entries: ZipInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const deflated = deflateRawSync(entry.data);
    const local = Buffer.concat([localHeader(entry, deflated), deflated]);
    centrals.push(centralHeader(entry, deflated, offset));
    locals.push(local);
    offset += local.length;
  }

  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, central, eocd]);
}

/** Клітинка аркуша. `date` кладеться зі стилем `s="1"`, який згенерований
 * `styles.xml` оголошує датовим (`numFmtId="14"`). */
export type XlsxCell =
  | { kind: "shared"; index: number }
  | { kind: "number"; value: number }
  | { kind: "date"; serial: number }
  | { kind: "inline"; text: string }
  | { kind: "empty" };

function columnName(idx: number): string {
  let n = idx + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function cellXml(cell: XlsxCell, ref: string): string {
  switch (cell.kind) {
    case "shared":
      return `<c r="${ref}" t="s"><v>${cell.index}</v></c>`;
    case "number":
      return `<c r="${ref}"><v>${cell.value}</v></c>`;
    case "date":
      return `<c r="${ref}" s="1"><v>${cell.serial}</v></c>`;
    case "inline":
      return `<c r="${ref}" t="inlineStr"><is><t>${cell.text}</t></is></c>`;
    case "empty":
      // Відсутня клітинка, а не порожня: саме так експорти позначають
      // пропуски, і саме тут перевіряється зсув колонок за атрибутом `r`.
      return "";
  }
}

/** XLSX з одним аркушем. */
export function makeXlsx(input: {
  sharedStrings: string[];
  rows: XlsxCell[][];
}): Buffer {
  const sst = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${input.sharedStrings.length}" uniqueCount="${input.sharedStrings.length}">${input.sharedStrings
    .map((v) => `<si><t>${v}</t></si>`)
    .join("")}</sst>`;

  const sheetRows = input.rows
    .map((cells, rowIdx) => {
      const inner = cells
        .map((cell, colIdx) =>
          cellXml(cell, `${columnName(colIdx)}${rowIdx + 1}`),
        )
        .join("");
      return `<row r="${rowIdx + 1}">${inner}</row>`;
    })
    .join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

  return makeZip([
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>", "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(workbook, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(rels, "utf8") },
    { name: "xl/sharedStrings.xml", data: Buffer.from(sst, "utf8") },
    { name: "xl/styles.xml", data: Buffer.from(styles, "utf8") },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet, "utf8") },
  ]);
}
