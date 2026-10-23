/**
 * Налаштування → Фінік → «Теги» (спека finyk-analytics-v3, Р6.6): усі вжиті
 * теги з кількістю операцій, перейменування й видалення скрізь. Ставляться
 * теги в деталях операції; злиття двох тегів поза скоупом.
 */
import { useState } from "react";
import type { TagSummary } from "@sergeant/finyk-domain/domain/tags";
import { Button } from "@shared/components/ui/Button";
import { CollectionManager } from "@shared/components/ui/CollectionManager";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Input } from "@shared/components/ui/Input";
import { messages } from "@shared/i18n/uk";

const t = messages.finyk.tags;

export function FinykTagsSection({
  tags,
  renameTag,
  removeTag,
}: {
  tags: readonly TagSummary[];
  renameTag: (key: string, newLabel: string) => void;
  removeTag: (key: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TagSummary | null>(null);

  const saveRename = (key: string) => {
    if (draft.trim()) renameTag(key, draft);
    setEditing(null);
  };

  return (
    <CollectionManager
      title={t.settingsTitle}
      count={tags.length}
      description={t.settingsDescription}
    >
      {(query) => {
        const visible = tags.filter((tag) => tag.key.includes(query));
        return (
          <>
            <p className="text-style-caption text-muted" role="status">
              {messages.collection.foundLabel}: {visible.length}
            </p>
            {visible.length > 0 ? (
              <ul className="divide-y divide-line" data-testid="tags-list">
                {visible.map((tag) =>
                  editing === tag.key ? (
                    <li key={tag.key} className="flex gap-2 py-2">
                      <Input
                        type="text"
                        value={draft}
                        aria-label={t.renameLabel.replace("{tag}", tag.label)}
                        className="flex-1 min-w-0"
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveRename(tag.key);
                        }}
                      />
                      <Button
                        type="button"
                        variant="solid"
                        className="shrink-0 h-11"
                        disabled={!draft.trim()}
                        onClick={() => saveRename(tag.key)}
                      >
                        {t.save}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="shrink-0 h-11"
                        onClick={() => setEditing(null)}
                      >
                        {t.cancel}
                      </Button>
                    </li>
                  ) : (
                    <li
                      key={tag.key}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-style-label break-words">
                          {tag.label}
                        </span>
                        <span className="block text-style-caption text-subtle">
                          {t.usedCount.replace("{count}", String(tag.count))}
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={t.renameAria.replace("{tag}", tag.label)}
                          onClick={() => {
                            setDraft(tag.label);
                            setEditing(tag.key);
                          }}
                        >
                          {t.rename}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          tone="danger"
                          aria-label={t.removeTagAria.replace(
                            "{tag}",
                            tag.label,
                          )}
                          onClick={() => setPendingDelete(tag)}
                        >
                          {t.remove}
                        </Button>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <EmptyState
                compact
                title={query ? messages.collection.emptySearch : t.emptyTitle}
                description={t.emptyDescription}
              />
            )}
            <ConfirmDialog
              open={pendingDelete !== null}
              title={t.confirmTitle}
              description={t.confirmDescription
                .replace("{tag}", pendingDelete?.label ?? "")
                .replace("{count}", String(pendingDelete?.count ?? 0))}
              confirmLabel={t.remove}
              onConfirm={() => {
                if (pendingDelete) removeTag(pendingDelete.key);
                setPendingDelete(null);
              }}
              onCancel={() => setPendingDelete(null)}
            />
          </>
        );
      }}
    </CollectionManager>
  );
}
