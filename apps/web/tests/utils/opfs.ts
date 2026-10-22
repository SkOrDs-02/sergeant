import type { Page } from "@playwright/test";

/**
 * Знімок OPFS origin-а для E2E: який файл що містить.
 *
 * AI-CONTEXT: SAH-пул `sqlite-wasm` кладе бази у файли-слоти (`/sergeant/sqlite/
 * <hex>`), а імʼя бази (`/sergeant-<id>.db`) лежить лише в 512-байтовому
 * заголовку слота. Тож «база стерта» тут перевіряється по БАЙТАХ, а не по імені
 * файлу: заголовок слота з імʼям партиції і текст запису, який лежав у базі.
 * Читання йде з головного потоку через `getFile()`, тож слот не може бути
 * захоплений воркером: знімати треба, коли воркер уже завершився (після
 * виходу) або ще не стартував.
 */
export interface OpfsFileProbe {
  readonly path: string;
  readonly size: number;
  /** Які з шуканих рядків трапились у файлі (UTF-8). */
  readonly needles: readonly string[];
  /** Перший збіг `headerPattern` у заголовку слота: імʼя бази, що зараз у слоті. */
  readonly partition: string | null;
  readonly error?: string;
}

export async function probeOpfs(
  page: Page,
  options: {
    readonly needles: readonly string[];
    /** Регекс (джерело) для 512-байтового заголовка слота. */
    readonly headerPattern: string;
  },
): Promise<OpfsFileProbe[]> {
  return page.evaluate(async ({ needles, headerPattern }) => {
    const out: {
      path: string;
      size: number;
      needles: string[];
      partition: string | null;
      error?: string;
    }[] = [];
    const header = new RegExp(headerPattern);
    const dec = new TextDecoder("latin1");
    const encoded = needles.map((n) => new TextEncoder().encode(n));
    function includes(hay: Uint8Array, needle: Uint8Array): boolean {
      outer: for (let i = 0; i + needle.length <= hay.length; i++) {
        for (let j = 0; j < needle.length; j++) {
          if (hay[i + j] !== needle[j]) continue outer;
        }
        return true;
      }
      return false;
    }
    type Walkable = FileSystemDirectoryHandle & {
      entries(): AsyncIterable<[string, FileSystemHandle]>;
    };
    async function walk(dir: Walkable, base: string): Promise<void> {
      for await (const [name, handle] of dir.entries()) {
        const path = `${base}/${name}`;
        if (handle.kind === "directory") {
          await walk(handle as Walkable, path);
          continue;
        }
        try {
          const file = await (handle as FileSystemFileHandle).getFile();
          const bytes = new Uint8Array(await file.arrayBuffer());
          out.push({
            path,
            size: bytes.length,
            needles: needles.filter((_, i) => includes(bytes, encoded[i]!)),
            partition:
              header.exec(dec.decode(bytes.subarray(0, 512)))?.[0] ?? null,
          });
        } catch (err) {
          out.push({
            path,
            size: -1,
            needles: [],
            partition: null,
            error: String(err),
          });
        }
      }
    }
    await walk((await navigator.storage.getDirectory()) as Walkable, "");
    return out;
  }, options);
}
