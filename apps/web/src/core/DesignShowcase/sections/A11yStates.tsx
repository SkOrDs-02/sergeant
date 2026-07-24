/**
 * A11y / States — semantic tokens for focus, selection, scrollbar,
 * caret, and dividers (Hard Rule #14 + Design System polish track 2).
 *
 * AI-CONTEXT: This section is the canonical visual contract for the new
 * `--c-ring*`, `--c-selection*`, `--c-caret`, `--c-scrollbar-*`, and
 * `--c-divider-*` tokens defined in `apps/web/src/styles/theme.css`. If
 * you retune any of those variables, audit this section in both light
 * and dark to make sure the focus ring still clears 3:1 contrast against
 * neighbour surfaces (WCAG 1.4.11) and the selection wash stays
 * readable.
 *
 * @sergeant/feature design-system
 * @sergeant/status active
 */
import { Button, Input } from "@shared/components/ui";
import { Group, Sec } from "../_shared/primitives";

/**
 * Single token row — palette square + role/CSS-variable + Tailwind
 * utility. Keeps every token visible alongside its source-of-truth.
 *
 * Use a `roleLabel` prop rather than `role` because the latter clashes
 * with ARIA semantics and trips `jsx-a11y/aria-role` even when applied
 * on a child component (false-positive guard).
 */
function TokenRow({
  swatchClass,
  variable,
  utility,
  roleLabel,
}: {
  swatchClass: string;
  variable: string;
  utility: string;
  roleLabel: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-divider-weak last:border-b-0">
      <div
        aria-hidden="true"
        className={`h-7 w-7 shrink-0 rounded-xl border border-divider ${swatchClass}`}
      />
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <code className="text-style-code text-text truncate">{variable}</code>
        <code className="text-style-code text-subtle truncate">{utility}</code>
      </div>
      <span className="text-style-caption text-muted shrink-0">
        {roleLabel}
      </span>
    </div>
  );
}

export function A11yStatesSection() {
  return (
    <Sec id="a11y-states" title="A11y / States">
      <p className="text-style-body text-muted">
        Семантичні токени для focus, selection, scrollbar, caret і дільників.
        Працюють однаково у світлій і темній темах — клас не повторюємо через{" "}
        {`dark:`}. Tab-нись по контролах нижче, виділи будь-який текст, проскрол
        всередині картки.
      </p>

      {/* Focus rings — Tab/Shift+Tab keyboard demo */}
      <Group label="Focus rings (Tab/Shift+Tab — keyboard only)">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#a11y"
              className="text-style-label text-brand-strong underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded-md px-1"
            >
              Текстове посилання
            </a>
            <button
              type="button"
              className="text-style-label rounded-xl border border-divider bg-panel px-3 py-1.5 text-text hover:bg-panelHi focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              ring-focus-strong (solid)
            </button>
          </div>
          <p className="text-style-caption text-subtle">
            Контракт:{" "}
            <code>
              focus-visible:ring-2 ring-focus/45 ring-offset-2 ring-offset-bg
            </code>
            . Pointer-клік не блимає кільцем (Hard Rule #14).
          </p>
        </div>
      </Group>

      {/* ::selection — text selection demo */}
      <Group label="::selection — виділення тексту">
        <p className="text-style-body text-text">
          Виділи цей абзац мишкою або {`⌘/Ctrl+A`}, щоб побачити м&apos;який
          емералд-фон і темно-зелений текст із токенів{" "}
          <code className="font-mono">--c-selection-bg</code> та{" "}
          <code className="font-mono">--c-selection-fg</code>. Однаково працює в
          обох темах і у Firefox через
          <code className="font-mono"> ::-moz-selection</code>.
        </p>
        <div className="mt-3 p-3 rounded-2xl bg-panelHi border border-divider">
          <p className="text-style-code text-text">
            const focusRing ={` `}
            <span className="text-brand-strong">{`"ring-focus/45"`}</span>;{` `}
          </p>
        </div>
      </Group>

      {/* Caret — text-caret demo */}
      <Group label="Caret — текстовий курсор">
        <div className="space-y-2">
          <Input
            placeholder="Клацни сюди, побач емералд-курсор"
            aria-label="Demo input з caret-brand"
          />
          <p className="text-style-caption text-subtle">
            Утиліта <code className="font-mono">caret-brand</code> (визначена в{" "}
            <code>utilities.css</code>) тримає курсор у фірмовому емералді в
            обох темах через <code className="font-mono">var(--c-caret)</code>.
          </p>
        </div>
      </Group>

      {/* Scrollbar — global + custom-scrollbar demo */}
      <Group label="Scrollbar — тонкі рейки через --c-scrollbar-*">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            className="h-40 overflow-auto rounded-2xl border border-divider bg-panel p-3 text-style-body text-text"
            aria-label="Скролл-демо — глобальний scrollbar"
          >
            <p className="text-style-label mb-2">Глобальний scrollbar</p>
            {Array.from({ length: 16 }).map((_, i) => (
              <p key={i} className="text-muted">
                Рядок {i + 1} — наведи курсор на трек, побач hover-фарбу на
                thumb-і.
              </p>
            ))}
          </div>
          <div
            className="h-40 overflow-auto rounded-2xl border border-divider bg-panel p-3 text-style-body text-text custom-scrollbar"
            aria-label="Скролл-демо — custom-scrollbar utility"
          >
            <p className="text-style-label mb-2">.custom-scrollbar</p>
            {Array.from({ length: 16 }).map((_, i) => (
              <p key={i} className="text-muted">
                Рядок {i + 1} — тонший варіант для popover / picker list.
              </p>
            ))}
          </div>
        </div>
      </Group>

      {/* Divider trio demo */}
      <Group label="Divider trio — weak / default / strong">
        <div className="rounded-2xl border border-divider bg-panel">
          <div className="px-4 py-3 border-b border-divider-weak">
            <p className="text-style-body text-text">
              <code className="text-style-code">border-divider-weak</code> —
              feather hairline між рядками у списку.
            </p>
          </div>
          <div className="px-4 py-3 border-b border-divider">
            <p className="text-style-body text-text">
              <code className="text-style-code">border-divider</code> —
              стандартний дільник між елементами картки.
            </p>
          </div>
          <div className="px-4 py-3 border-b border-divider-strong">
            <p className="text-style-body text-text">
              <code className="text-style-code">border-divider-strong</code> —
              між великими секціями (header → content).
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-style-body text-text">
              Останній рядок без дільника — Tailwind
              <code className="text-style-code"> last:border-b-0</code>.
            </p>
          </div>
        </div>
      </Group>

      {/* Token cheat-sheet */}
      <Group label="Token cheat-sheet">
        <div className="rounded-2xl border border-divider bg-panel p-3">
          <TokenRow
            swatchClass="bg-focus"
            variable="--c-ring"
            utility="ring-focus"
            roleLabel="focus base"
          />
          <TokenRow
            swatchClass="bg-focus-strong"
            variable="--c-ring-strong"
            utility="ring-focus-strong"
            roleLabel="focus solid"
          />
          <TokenRow
            swatchClass="bg-selection"
            variable="--c-selection-bg"
            utility="bg-selection"
            roleLabel="selection bg"
          />
          <TokenRow
            swatchClass="bg-caret"
            variable="--c-caret"
            utility="caret-brand"
            roleLabel="caret"
          />
          <TokenRow
            swatchClass="bg-scrollbar-thumb"
            variable="--c-scrollbar-thumb"
            utility="bg-scrollbar-thumb"
            roleLabel="scrollbar"
          />
          <TokenRow
            swatchClass="bg-divider-weak"
            variable="--c-divider-weak"
            utility="border-divider-weak"
            roleLabel="divider 1"
          />
          <TokenRow
            swatchClass="bg-divider"
            variable="--c-divider"
            utility="border-divider"
            roleLabel="divider 2"
          />
          <TokenRow
            swatchClass="bg-divider-strong"
            variable="--c-divider-strong"
            utility="border-divider-strong"
            roleLabel="divider 3"
          />
        </div>
      </Group>
    </Sec>
  );
}
