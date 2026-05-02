import { Sec, Group, ColorSwatch } from "../_shared";

export function ColorsSection() {
  return (
    <Sec id="colors" title="Кольори та токени">
      <Group label="Semantic — Поверхні">
        <div className="flex flex-wrap gap-4">
          <ColorSwatch label="bg-bg" className="bg-bg" />
          <ColorSwatch label="bg-panel" className="bg-panel" />
          <ColorSwatch label="bg-panelHi" className="bg-panelHi" />
          <ColorSwatch label="bg-line" className="bg-line" />
        </div>
      </Group>

      <Group label="Semantic — Текст">
        <div className="flex gap-8 items-baseline">
          <div className="flex flex-col gap-1.5">
            <span className="text-base font-semibold text-text">text-text</span>
            <span className="text-base text-muted">text-muted</span>
            <span className="text-base text-subtle">text-subtle</span>
          </div>
        </div>
      </Group>

      <Group label="Brand & Status">
        <div className="flex flex-wrap gap-4">
          <ColorSwatch label="accent" className="bg-accent" />
          <ColorSwatch label="success" className="bg-success" />
          <ColorSwatch label="warning" className="bg-warning" />
          <ColorSwatch label="danger" className="bg-danger" />
          <ColorSwatch label="info" className="bg-info" />
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <ColorSwatch label="success-soft" className="bg-success-soft" />
          <ColorSwatch label="warning-soft" className="bg-warning-soft" />
          <ColorSwatch label="danger-soft" className="bg-danger-soft" />
          <ColorSwatch label="info-soft" className="bg-info-soft" />
        </div>
      </Group>

      <Group label="Module Brands">
        <div className="flex flex-wrap gap-4">
          <ColorSwatch label="finyk" className="bg-finyk" />
          <ColorSwatch label="fizruk" className="bg-fizruk" />
          <ColorSwatch label="routine" className="bg-routine" />
          <ColorSwatch label="nutrition" className="bg-nutrition" />
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <ColorSwatch label="finyk-soft" className="bg-finyk-soft" />
          <ColorSwatch label="fizruk-soft" className="bg-fizruk-soft" />
          <ColorSwatch label="routine-surface" className="bg-routine-surface" />
          <ColorSwatch label="nutrition-soft" className="bg-nutrition-soft" />
        </div>
      </Group>

      <Group label="Тіні">
        <div className="flex flex-wrap gap-4">
          <div className="shadow-soft bg-panel rounded-2xl border border-line px-4 py-3 text-xs text-muted font-mono">
            shadow-soft
          </div>
          <div className="shadow-card bg-panel rounded-2xl border border-line px-4 py-3 text-xs text-muted font-mono">
            shadow-card
          </div>
          <div className="shadow-float bg-panel rounded-2xl border border-line px-4 py-3 text-xs text-muted font-mono">
            shadow-float
          </div>
        </div>
      </Group>
    </Sec>
  );
}
