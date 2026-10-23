import { useId, useState } from "react";
import {
  addTxTag,
  MAX_TAGS_PER_TX,
  TAG_MAX_LEN,
  type TagSummary,
} from "@sergeant/finyk-domain/domain/tags";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { messages } from "@shared/i18n/uk";

const t = messages.finyk.tags;

/**
 * Поле тегів операції (Р6.1/Р6.2): чипи з кнопкою «прибрати» і рядок
 * вводу. Автодоповнення дає нативний `<datalist>` з уже вжитих тегів;
 * написання першого вжитку підставляє `addTxTag` (Р6.5).
 */
export function TxTagsField({
  tags,
  known,
  onChange,
}: {
  tags: readonly string[];
  known: readonly TagSummary[];
  onChange: (tags: readonly string[]) => void;
}) {
  const listId = useId();
  const labelId = useId();
  const [draft, setDraft] = useState("");
  const full = tags.length >= MAX_TAGS_PER_TX;

  const submit = () => {
    const next = addTxTag(tags, draft, known);
    if (next !== tags) onChange(next);
    setDraft("");
  };

  return (
    <section aria-labelledby={labelId} className="space-y-2">
      <h3 id={labelId} className="px-2 text-style-label text-text">
        {t.fieldLabel}
      </h3>
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-2" data-testid="tx-tags-chips">
          {tags.map((tag) => (
            <li key={tag}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={t.removeAria.replace("{tag}", tag)}
                onClick={() => onChange(tags.filter((x) => x !== tag))}
              >
                {tag} ×
              </Button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p className="px-2 text-style-caption text-muted" role="status">
          {t.limitReached.replace("{max}", String(MAX_TAGS_PER_TX))}
        </p>
      ) : (
        <div className="flex gap-2">
          <Input
            type="text"
            value={draft}
            list={listId}
            maxLength={TAG_MAX_LEN}
            aria-label={t.inputLabel}
            placeholder={t.inputPlaceholder}
            className="flex-1 min-w-0"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
          <datalist id={listId}>
            {known.map((tag) => (
              <option key={tag.key} value={tag.label} />
            ))}
          </datalist>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 h-11"
            disabled={draft.trim() === ""}
            onClick={submit}
          >
            {t.add}
          </Button>
        </div>
      )}
    </section>
  );
}
