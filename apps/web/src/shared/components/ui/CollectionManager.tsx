import { useId, useState, type ReactNode } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { Sheet } from "@shared/components/ui/Sheet";
import { messages } from "@shared/i18n/uk";
import { ContentGroup } from "./ContentGroup";

interface CollectionManagerProps {
  title: string;
  count: number;
  limit?: number;
  description: ReactNode;
  children: (query: string) => ReactNode;
}

/** Settings show the function; its searchable collection owns the sheet. */
export function CollectionManager({
  title,
  count,
  limit,
  description,
  children,
}: CollectionManagerProps) {
  const copy = messages.collection;
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <ContentGroup
      as="section"
      variant="bounded"
      aria-labelledby={titleId}
      className="space-y-3"
    >
      <h3 id={titleId} className="text-style-label-lg font-semibold text-text">
        {title}
      </h3>
      <p className="text-style-body text-muted leading-snug">{description}</p>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-style-caption text-muted">
          {copy.countLabel}: {count}
          {limit !== undefined ? ` / ${limit}` : ""}
        </span>
        <Button
          variant="outline"
          aria-label={`${copy.manage}: ${title}`}
          onClick={() => {
            setQuery("");
            setOpen(true);
          }}
        >
          {copy.manage}
        </Button>
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        zIndex={120}
      >
        <div className="space-y-4">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={`${copy.search}: ${title}`}
            placeholder={copy.searchPlaceholder}
          />
          {children(query.trim().toLocaleLowerCase("uk-UA"))}
        </div>
      </Sheet>
    </ContentGroup>
  );
}
