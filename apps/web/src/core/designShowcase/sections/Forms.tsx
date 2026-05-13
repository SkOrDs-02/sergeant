import { useState } from "react";
import {
  FormField,
  Icon,
  Input,
  Select,
  Slider,
  Switch,
  Textarea,
} from "@shared/components/ui";
import { Sec, Group } from "../_shared";

export function FormsSection() {
  const [singleValue, setSingleValue] = useState(40);
  const [rangeValue, setRangeValue] = useState<readonly [number, number]>([
    20, 80,
  ]);
  const [pushOn, setPushOn] = useState(true);
  const [emailOn, setEmailOn] = useState(false);
  return (
    <Sec id="forms" title="Форми">
      <Group label="Input — варіанти та розміри">
        <div className="space-y-3">
          {(["default", "filled", "ghost"] as const).map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-3">
              <span className="text-2xs text-subtle w-14 shrink-0 font-mono">
                {variant}
              </span>
              {(["sm", "md", "lg"] as const).map((size) => (
                <Input
                  key={size}
                  variant={variant}
                  size={size}
                  placeholder={`size=${size}`}
                  className="w-36"
                />
              ))}
            </div>
          ))}
        </div>
      </Group>

      <Group label="Input — стани" row>
        <Input placeholder="Default" className="w-40" />
        <Input placeholder="Error" error className="w-40" />
        <Input placeholder="Success" success className="w-40" />
        <Input
          placeholder="З іконкою"
          icon={<Icon name="search" size={16} className="text-muted" />}
          className="w-40"
        />
      </Group>

      <Group label="Textarea">
        <Textarea
          placeholder="Введи текст…"
          rows={3}
          className="w-full max-w-sm"
        />
      </Group>

      <Group label="Select — розміри та error" row>
        {(["sm", "md", "lg"] as const).map((size) => (
          <Select
            key={size}
            size={size}
            className="w-40"
            aria-label={`Приклад Select, розмір ${size}`}
          >
            <option>Варіант 1</option>
            <option>Варіант 2</option>
          </Select>
        ))}
        <Select className="w-40" error aria-label="Приклад Select, стан error">
          <option>Error стан</option>
        </Select>
      </Group>

      <Group label="FormField">
        <div className="space-y-4 max-w-sm">
          <FormField label="Стандартне поле" helperText="Підказка під полем">
            <Input placeholder="Введи значення" />
          </FormField>
          <FormField label="З помилкою" error="Поле обов'язкове">
            <Input placeholder="Помилка" error />
          </FormField>
          <FormField label="Необов'язкове" optional>
            <Input placeholder="Можна пропустити" />
          </FormField>
          <FormField
            label="Normal case label"
            normalCaseLabel
            helperText="Звичайний стиль мітки"
          >
            <Input placeholder="Текст" />
          </FormField>
        </div>
      </Group>

      <Group label="Switch — розміри">
        <div className="flex flex-col gap-4 max-w-sm">
          <Switch
            size="sm"
            checked={pushOn}
            onChange={setPushOn}
            label="Push (sm)"
            description="Компактний рядок у налаштуваннях"
          />
          <Switch
            size="md"
            checked={emailOn}
            onChange={setEmailOn}
            label="Email-дайджест (md)"
            description="Стандартний розмір для форм"
          />
        </div>
      </Group>

      <Group label="Switch — стани">
        <div className="flex flex-col gap-3 max-w-sm">
          <Switch defaultChecked label="Uncontrolled (defaultChecked)" />
          <Switch
            checked={false}
            onChange={() => {}}
            disabled
            label="Disabled off"
          />
          <Switch
            checked={true}
            onChange={() => {}}
            disabled
            label="Disabled on"
          />
          <Switch
            defaultChecked={false}
            error
            label="З помилкою"
            description="Це поле обов'язкове"
          />
        </div>
      </Group>

      <Group label="Slider — single + ticks">
        <div className="space-y-5 max-w-sm">
          <Slider
            aria-label="Гучність (sm)"
            size="sm"
            value={singleValue}
            onChange={setSingleValue}
            ticks={[0, 25, 50, 75, 100]}
            showTooltip
            formatValue={(n) => `${n}%`}
          />
          <Slider
            aria-label="Гучність (md)"
            value={singleValue}
            onChange={setSingleValue}
            ticks={[0, 25, 50, 75, 100]}
            showTooltip
            formatValue={(n) => `${n}%`}
          />
        </div>
      </Group>

      <Group label="Slider — range">
        <div className="space-y-5 max-w-sm">
          <Slider
            range
            aria-label="Діапазон цін"
            min={0}
            max={100}
            value={rangeValue}
            onChange={setRangeValue}
            showTooltip
            formatValue={(n) => `${n} ₴`}
          />
          <p className="text-xs text-muted tabular-nums">
            {rangeValue[0]} – {rangeValue[1]} ₴
          </p>
        </div>
      </Group>

      <Group label="Slider — disabled">
        <div className="max-w-sm">
          <Slider
            aria-label="Disabled slider"
            value={30}
            onChange={() => {}}
            disabled
          />
        </div>
      </Group>
    </Sec>
  );
}
