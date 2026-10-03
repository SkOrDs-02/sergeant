/**
 * Витягує JSON-обʼєкт або масив з довільного тексту.
 * Потрібно, бо LLM інколи додає пояснення/текст навколо JSON.
 */
export function extractJsonFromText(raw: unknown): unknown {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;

  // 1) Спробувати як є
  try {
    return JSON.parse(s);
  } catch {
    /* continue */
  }

  // 2) Витягнути перший JSON обʼєкт/масив за дужками
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let start = -1;
  let open = "";
  let close = "";
  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    start = firstObj;
    open = "{";
    close = "}";
  } else if (firstArr !== -1) {
    start = firstArr;
    open = "[";
    close = "]";
  }
  if (start === -1) return null;

  const extracted = extractBalancedJsonSlice(s.slice(start), open, close);
  if (!extracted) return null;

  // 3) Спроба parse витягнутого слайсу
  try {
    return JSON.parse(extracted);
  } catch {
    /* continue */
  }

  // 4) Мінімальний repair для частих кейсів (типографічні лапки, BOM)
  const repaired = extracted
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

function extractBalancedJsonSlice(
  text: string,
  open: string,
  close: string,
): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === open) depth++;
    if (ch === close) depth--;
    if (depth === 0) return text.slice(0, i + 1);
  }
  return null;
}
