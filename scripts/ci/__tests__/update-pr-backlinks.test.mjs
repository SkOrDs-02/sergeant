/**
 * Last validated: 2026-09-12
 * Status: Active
 *
 * Гейт проти повернення тихої дірки в Hard Rule #26: список файлів PR
 * мусить бути повним, інакше скрипт не має права вирішувати, що
 * канонічних доків «не торкались».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertCompleteFileList } from "../update-pr-backlinks.mjs";

test("повний список проходить мовчки", () => {
  assert.doesNotThrow(() => assertCompleteFileList(956, 956, 1081));
  assert.doesNotThrow(() => assertCompleteFileList(0, 0, 1));
});

test("обрізаний список — помилка, а не тихий нуль", () => {
  assert.throws(
    () => assertCompleteFileList(100, 956, 1081),
    /fetched 100 changed file\(s\) but GitHub reports 956/,
  );
});

test("у тексті помилки є номер PR і згадка про стелю API", () => {
  try {
    assertCompleteFileList(3000, 4200, 777);
    assert.fail("мало кинути");
  } catch (err) {
    assert.match(err.message, /#777/);
    assert.match(err.message, /3000/);
  }
});

test("невідома кількість (поле відсутнє) не валить прогін", () => {
  // `changedFiles` може не приїхати зі старішого gh — тоді звіряти нічого,
  // і гейт не має падати на самій лише відсутності поля.
  assert.doesNotThrow(() => assertCompleteFileList(5, undefined, 1));
  assert.doesNotThrow(() => assertCompleteFileList(5, null, 1));
});
