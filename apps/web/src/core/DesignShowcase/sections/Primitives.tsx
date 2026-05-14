import { useState } from "react";
import {
  Button,
  Popover,
  PopoverDivider,
  PopoverItem,
  Tooltip,
} from "@shared/components/ui";
import { Sec, Group } from "../_shared/primitives";

/**
 * Floating primitives — Tooltip + Popover.
 *
 * Both are portaled to `document.body` so they escape transformed
 * ancestors (Hub page transitions, swipe-tab translation). Tooltip
 * is hover/focus only and non-interactive; Popover is click-driven
 * with a focus trap and supports menus, info cards, and form-in-
 * popover patterns.
 */
export function PrimitivesSection() {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <Sec id="primitives" title="Tooltip & Popover">
      {/* ── Tooltip ───────────────────────────────────────────── */}
      <Group label="Tooltip — розміщення" row>
        <Tooltip content="top-start" placement="top-start">
          <Button variant="secondary" size="sm">
            top-start
          </Button>
        </Tooltip>
        <Tooltip content="top" placement="top">
          <Button variant="secondary" size="sm">
            top
          </Button>
        </Tooltip>
        <Tooltip content="top-end" placement="top-end">
          <Button variant="secondary" size="sm">
            top-end
          </Button>
        </Tooltip>
        <Tooltip content="right" placement="right">
          <Button variant="secondary" size="sm">
            right
          </Button>
        </Tooltip>
        <Tooltip content="bottom-start" placement="bottom-start">
          <Button variant="secondary" size="sm">
            bottom-start
          </Button>
        </Tooltip>
        <Tooltip content="bottom" placement="bottom">
          <Button variant="secondary" size="sm">
            bottom
          </Button>
        </Tooltip>
        <Tooltip content="bottom-end" placement="bottom-end">
          <Button variant="secondary" size="sm">
            bottom-end
          </Button>
        </Tooltip>
        <Tooltip content="left" placement="left">
          <Button variant="secondary" size="sm">
            left
          </Button>
        </Tooltip>
      </Group>

      <Group label="Tooltip — розміри" row>
        <Tooltip content="Зберегти зміни (Ctrl+S)" size="sm">
          <Button variant="ghost" size="sm">
            size=sm
          </Button>
        </Tooltip>
        <Tooltip
          size="md"
          content="Дія негайно синхронізує локальні зміни з сервером і чекає підтвердження від cloud-sync queue."
        >
          <Button variant="ghost" size="sm">
            size=md (multi-line)
          </Button>
        </Tooltip>
      </Group>

      {/* ── Popover · menu ────────────────────────────────────── */}
      <Group label="Popover — меню дій" row>
        <Popover
          trigger={
            <Button variant="secondary" size="sm">
              Опції картки
            </Button>
          }
        >
          <PopoverItem onClick={() => undefined}>Редагувати</PopoverItem>
          <PopoverItem onClick={() => undefined}>Дублювати</PopoverItem>
          <PopoverDivider />
          <PopoverItem destructive onClick={() => undefined}>
            Видалити
          </PopoverItem>
        </Popover>
      </Group>

      {/* ── Popover · info card ────────────────────────────────── */}
      <Group label="Popover — info card">
        <Popover
          placement="bottom-start"
          trigger={
            <Button variant="ghost" size="sm">
              ?
            </Button>
          }
          header="Як рахується ліміт"
          label="Як рахується ліміт"
        >
          <p className="px-2 py-2 text-sm text-muted leading-relaxed max-w-xs">
            Ліміт — це сума, яку ти готовий витратити цього місяця. Перевищення
            підсвічується червоним і триггерить m-of-m попередження за 3 дні до
            перевищення тренду.
          </p>
        </Popover>
      </Group>

      {/* ── Popover · form in popover ─────────────────────────── */}
      <Group label="Popover — форма-в-попапі">
        <Popover
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          trigger={
            <Button variant="secondary" size="sm">
              Фільтри транзакцій
            </Button>
          }
          header="Фільтри транзакцій"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFiltersOpen(false)}
              >
                Скинути
              </Button>
              <Button size="sm" onClick={() => setFiltersOpen(false)}>
                Застосувати
              </Button>
            </div>
          }
        >
          <div className="px-2 py-2 space-y-2 text-sm text-fg min-w-[220px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-accent" />
              Доходи
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-accent" defaultChecked />
              Витрати
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-accent" />
              Перекази
            </label>
          </div>
        </Popover>
      </Group>
    </Sec>
  );
}
