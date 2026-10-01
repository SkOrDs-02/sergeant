/**
 * ProductThumb — квадратик «що це за товар» у картці звʼязаного продукту.
 *
 * Рішення власника 2026-09-11 (U1): фото беремо з Open Food Facts за
 * штрихкодом (`image_url`, вільна ліцензія), фолбек — іконка категорії.
 * Unsplash не підключаємо: це фотобанк художніх фото, а не каталог
 * продуктів — на запит «молоко» він дасть красиву склянку в полі, а не
 * те, що стоїть у холодильнику.
 *
 * ФОЛБЕК ПРАЦЮЄ ЗАВЖДИ, І ЦЕ ГОЛОВНЕ. `categorizeFood` резолвить
 * категорію з САМОЇ НАЗВИ, без мережі й без штрихкода. Тобто квадратик
 * ніколи не буває порожнім: фото є лише в товарів, які приїхали сканом і
 * яких OFF знає в обличчя, а впізнаваність потрібна всім. Саме тому
 * компонент не має стану «завантажується»: він одразу малює іконку, а
 * фото, якщо воно є, лягає зверху.
 *
 * AI-DANGER: не додавай сюди спінер і не роби `<img>` єдиним вмістом.
 * Хост OFF лежить поза нашим контролем, віддає з іншого континенту й
 * час від часу відповідає 404 на URL, який сам же й видав. Картинка, що
 * не приїхала, мусить деградувати в іконку мовчки — `onError` нижче — а
 * не лишати діру в макеті.
 *
 * Status: Active
 * Last validated: 2026-09-13
 */
import { useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import type { IconName } from "@shared/components/ui/Icon";
import { categorizeFood } from "@sergeant/nutrition-domain";

interface ProductThumbProps {
  /** Назва продукту — з неї резолвиться категорія для фолбека. */
  name: string;
  /** Фото з OFF або `null`, коли джерело його не дало. */
  imageUrl?: string | null | undefined;
}

export function ProductThumb({ name, imageUrl }: ProductThumbProps) {
  const [failed, setFailed] = useState(false);
  const category = categorizeFood(name);
  const showImage = Boolean(imageUrl) && !failed;

  return (
    <div
      className="shrink-0 w-11 h-11 rounded-xl bg-panelHi border border-line overflow-hidden flex items-center justify-center"
      // Категорія — це здогадка по назві, і показувати її як підпис було б
      // надто впевнено. Але для скрінрідера квадратик має бути чимось, а
      // не безіменною картинкою.
      aria-label={category.label}
      role="img"
    >
      {showImage ? (
        <img
          src={imageUrl ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          // `alt=""` навмисно порожній: підпис уже несе контейнер вище
          // (`role="img"` + `aria-label`), а дубль змусив би скрінрідер
          // прочитати те саме двічі.
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon
          name={category.iconName as IconName}
          size="sm"
          className="text-subtle"
          aria-hidden
        />
      )}
    </div>
  );
}
