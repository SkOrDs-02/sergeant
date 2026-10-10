/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Ручний column-mapper для невідомого формату CSV-виписки (спека §
 * Рішення дизайну Фази 2: "Невідомий формат → ручний mapper з preview
 * перших 5 рядків"). `previewImportStatement` повертає `needsMapping:
 * true` разом з `headers`/`sampleRows` (капнуто на 5 рядків сервером) —
 * цей екран лише збирає `ImportColumnMapping` і повертає керування
 * викликачу, який шле ПОВТОРНИЙ `previewImportStatement` з `mapping`.
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Label } from "@shared/components/ui/FormField";
import { Select } from "@shared/components/ui/Select";
import { Switch } from "@shared/components/ui/Switch";
import type {
  ImportColumnMapping,
  ImportDateFormat,
} from "@sergeant/api-client";

export interface ColumnMapperProps {
  headers: string[];
  sampleRows: string[][];
  onSubmit: (mapping: ImportColumnMapping) => void;
  isSubmitting?: boolean | undefined;
}

export function ColumnMapper({
  headers,
  sampleRows,
  onSubmit,
  isSubmitting = false,
}: ColumnMapperProps) {
  const [dateCol, setDateCol] = useState(headers[0] ?? "");
  const [amountCol, setAmountCol] = useState(headers[1] ?? headers[0] ?? "");
  const [descriptionCol, setDescriptionCol] = useState(
    headers[2] ?? headers[0] ?? "",
  );
  // "" = окремої колонки надходжень немає: `amountCol` — сума зі знаком.
  const [creditCol, setCreditCol] = useState("");
  const [dateFormat, setDateFormat] = useState<ImportDateFormat>("DD.MM.YYYY");
  const [decimalComma, setDecimalComma] = useState(true);

  const canSubmit = Boolean(dateCol && amountCol && descriptionCol);

  return (
    <div className="space-y-4">
      <p className="text-style-body text-muted">
        Не впізнав формат виписки, вкажи, яка колонка за що відповідає.
      </p>

      {sampleRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-style-caption">
            <thead>
              <tr className="border-b border-line bg-panel">
                {headers.map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-text"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="whitespace-nowrap px-2 py-1 text-subtle"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label htmlFor="col-date">Колонка дати</Label>
          <Select
            id="col-date"
            value={dateCol}
            onChange={(e) => setDateCol(e.target.value)}
          >
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="col-amount">Колонка суми або витрат (дебет)</Label>
          <Select
            id="col-amount"
            aria-describedby="col-amount-hint"
            value={amountCol}
            onChange={(e) => {
              const next = e.target.value;
              setAmountCol(next);
              // Одна колонка не може бути і дебетом, і кредитом: сервер тоді
              // мовчки читав би її як суму зі знаком.
              if (next === creditCol) setCreditCol("");
            }}
          >
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
          <p id="col-amount-hint" className="mt-1 text-style-body text-subtle">
            Без окремої колонки надходжень тут сума зі знаком: мінус це витрата,
            плюс це надходження.
          </p>
        </div>
        <div>
          <Label htmlFor="col-credit">
            Колонка надходжень (кредит), якщо окрема
          </Label>
          <Select
            id="col-credit"
            value={creditCol}
            onChange={(e) => setCreditCol(e.target.value)}
          >
            <option value="">немає</option>
            {headers
              .filter((h) => h !== amountCol)
              .map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="col-desc">Колонка опису</Label>
          <Select
            id="col-desc"
            value={descriptionCol}
            onChange={(e) => setDescriptionCol(e.target.value)}
          >
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="date-format">Формат дати</Label>
          <Select
            id="date-format"
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value as ImportDateFormat)}
          >
            <option value="DD.MM.YYYY">ДД.ММ.РРРР</option>
            <option value="YYYY-MM-DD">РРРР-ММ-ДД</option>
          </Select>
        </div>
        <Switch
          checked={decimalComma}
          onChange={setDecimalComma}
          label="Кома як десятковий роздільник"
          description="Увімкни для «1 234,56», вимкни для «1234.56»."
        />
      </div>

      <Button
        variant="solid"
        className="w-full"

        disabled={!canSubmit}
        loading={isSubmitting}
        onClick={() =>
          onSubmit({
            dateCol,
            amountCol,
            // Лише коли обрано: інакше ключа немає взагалі, і сервер
            // читає `amountCol` як суму зі знаком.
            ...(creditCol ? { creditCol } : {}),
            descriptionCol,
            dateFormat,
            decimalComma,
          })
        }
        tone="ink"
      >
        Продовжити
      </Button>
    </div>
  );
}
