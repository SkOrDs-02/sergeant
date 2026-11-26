import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { nutritionApi } from "@shared/api";
import type { AccessDenial } from "@shared/lib/api/accessDenial";
import { useAccessGuard } from "../../../core/access/useCanUse";
import { formatNutritionError, PARSE_FAILED } from "../lib/nutritionErrors";
import {
  appendNutritionPantryEvent,
  backfillNutritionPantryCheckpoints,
  loadPantries,
  persistPantries,
  updatePantry,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_ACTIVE_PANTRY_KEY,
} from "../lib/nutritionStorage";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";
import {
  canonicalFoodKey,
  displayFoodName,
  matchFoodName,
  parseLoosePantryText,
  type PantryItem,
} from "../lib/pantryTextParser";
import {
  buildPlacedItems,
  ensureStoragePlaces,
  mergeItemsIntoPlaces,
  movePantryItem,
  newPantryItemId,
  DEFAULT_PLACE_ID,
  type Pantry,
  type PlacedPantryItem,
} from "@sergeant/nutrition-domain";
import { usePantryPlaces } from "./usePantryPlaces";
import { resolvePlaceOfWithFilter } from "../lib/resolvePlaceOfWithFilter";
import {
  rememberAmbiguousUnitChoice,
  type AmbiguousPantryUnit,
} from "../lib/pantryAmbiguousUnitMemory";
import { usePantryConsumeWrite } from "./usePantryConsumeWrite";
import {
  usePantryReplenishWrite,
  normalizeIncomingItems,
} from "./usePantryReplenishWrite";

/**
 * Де позиція лежить у свіжому стані. За стабільним id (data-40), а не за
 * індексом зі старого рендера: pull з іншого пристрою міг зсунути список, і
 * індекс тоді вказує на сусідню позицію. Легасі-позиція без id лишається на
 * індексі. `-1`, коли позиції вже немає.
 */
function localIndexOf(
  pantries: readonly Pantry[],
  ref: PlacedPantryItem,
): number {
  if (!ref.id) return ref.localIdx;
  const items = pantries.find((p) => p.id === ref.pantryId)?.items ?? [];
  return items.findIndex((x) => x?.id === ref.id);
}

export type { PantryReplenishLine } from "./usePantryReplenishWrite";

export interface PantryItemsAddedEntry {
  name: string;
  pantryId: string;
}

export interface UseNutritionPantriesParams {
  setBusy: Dispatch<SetStateAction<boolean>>;
  setErr: Dispatch<SetStateAction<string>>;
  setStatusText: Dispatch<SetStateAction<string>>;
  /** Причина, з якої розбір списку НЕ запустили (A3, поставка 2). */
  setDenial: (denial: AccessDenial) => void;
  /**
   * Рішення власника 2026-09-11 — «куди лягло». Хук нічого не знає про
   * toast (той живе у `NutritionApp.tsx`, разом із `useToast()`), тому
   * кожне успішне злиття нових/оновлених позицій у комору лише повідомляє
   * назву й фінальне місце через цей колбек; сам toast-текст і дію
   * «Змінити» складає викликач.
   */
  onItemsAdded?: (items: PantryItemsAddedEntry[]) => void;
}

interface ParsePantryVariables {
  pantryId: string;
  text: string;
}

/** Звідки взялись позиції у превʼю — впливає лише на копірайт підказки. */
export type PantryParseSource = "ai" | "local";

export interface PantryParsePreview {
  items: PantryItem[];
  source: PantryParseSource;
  /**
   * Місце, у чернетці якого лежав текст. Потрібне не для розкладання
   * (позиції їдуть по вгаданих місцях), а щоб очистити рівно ту чернетку,
   * з якої розбір запускався.
   */
  pantryId: string;
}

export function useNutritionPantries({
  setBusy,
  setErr,
  setStatusText,
  setDenial,
  onItemsAdded,
}: UseNutritionPantriesParams) {
  const guard = useAccessGuard(setDenial);
  // `ensureStoragePlaces` стоїть на КОЖНОМУ вході даних у стан, а не лише
  // на першому: інакше після теплого SQLite-кешу холодильник і морозилка
  // зникали б з екрана до наступного перезавантаження.
  const [pantries, setPantries] = useState(() =>
    ensureStoragePlaces(
      loadPantries(NUTRITION_PANTRIES_KEY, NUTRITION_ACTIVE_PANTRY_KEY),
    ),
  );

  const sqliteCacheTick = useNutritionSqliteReadTick();
  const [prevSqliteTick, setPrevSqliteTick] = useState(sqliteCacheTick);
  // Масив, що прийшов із кешу, а не з дії користувача. Ефект збереження
  // нижче його пропускає: інакше кожен pull (тік кешу) знову ставив комору
  // в outbox, і пристрої перекидали одне одному ті самі позиції без кінця
  // (прод 2026-11-26: тисячі `nutrition_pantry_items` на годину без жодної
  // дії; знімок попереднього тіку проти новішого кешу ще й повертав старі
  // значення як «зміни»).
  const [pantriesFromCache, setPantriesFromCache] = useState<
    typeof pantries | null
  >(null);
  if (sqliteCacheTick !== prevSqliteTick) {
    setPrevSqliteTick(sqliteCacheTick);
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt !== null) {
      const hydrated = ensureStoragePlaces(cache.pantries);
      setPantries(hydrated);
      setPantriesFromCache(hydrated);
    }
  }

  /**
   * Фільтр місця — суто екранний стан, і це не недогляд. Персистований
   * фільтр — це рівно та активна комора, яку ця робота знімає: після
   * перезавантаження людина знову бачила б одне місце замість усіх.
   */
  const [placeFilter, setPlaceFilter] = useState<string | null>(null);

  // Чернетка списку живе в дефолтному місці: текст ще не розібраний на
  // позиції, тож місця в нього немає — воно зʼявиться у кожної позиції
  // окремо при підтвердженні розбору.
  const draftPantry = useMemo(
    () =>
      pantries.find((p) => p.id === DEFAULT_PLACE_ID) ?? pantries[0] ?? null,
    [pantries],
  );
  const pantryText = draftPantry?.text || "";

  /** Усі позиції всіх місць одним списком; його індекс — адреса мутації. */
  const pantryItems = useMemo(() => buildPlacedItems(pantries), [pantries]);
  const [newItemName, setNewItemName] = useState("");

  const places = usePantryPlaces({ pantries, setPantries, setPlaceFilter });

  const [itemEdit, setItemEdit] = useState(() => ({
    open: false,
    idx: -1,
    name: "",
    qty: "",
    unit: "",
    err: "",
    pantryId: "",
    itemId: "",
  }));

  const [pantryStorageErr, setPantryStorageErr] = useState("");

  const [parsePreview, setParsePreview] = useState<PantryParsePreview | null>(
    null,
  );

  // DCRUD-007: skip the mount run — it would persist the UNHYDRATED
  // initial state (LS is tombstoned after the first boot, so that state
  // is an empty default) while the SQLite cache may already be warm;
  // the resulting dual-write diff soft-deletes every pantry item the
  // user has. Before the value-based diff fix this wipe was silently
  // "healed" by the spurious-upsert feedback loop; now it must simply
  // never fire. Real mutations and the overlay hydration re-run the
  // effect with meaningful state.
  const pantriesHydratedRef = useRef(false);
  // Оголошений ДО ефекту збереження: ефекти одного коміту йдуть у порядку
  // оголошення, тож ref уже вказує на свіжий масив із кешу.
  const pantriesFromCacheRef = useRef<typeof pantries | null>(null);
  useEffect(() => {
    pantriesFromCacheRef.current = pantriesFromCache;
  }, [pantriesFromCache]);
  useEffect(() => {
    if (!pantriesHydratedRef.current) {
      pantriesHydratedRef.current = true;
      return;
    }
    if (pantries === pantriesFromCacheRef.current) return;
    // `null` замість активного місця: активної комори більше немає, а
    // збережене значення лишається недоторканим (persistPantries падає на
    // попереднє). Переписати його тут означало б зафіксувати фільтр у
    // сховищі — саме те, чого ця робота позбувається.
    const ok = persistPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
      pantries,
      null,
    );
    setPantryStorageErr(ok ? "" : "Не вдалося зберегти дані комор.");
  }, [pantries]);

  // W1-PANTRY-APPEND стадія 2 — чекпойнт 'initial' на живу позицію (ADR-0077
  // §5); ідемпотентно, гейт повтору — усередині функції.
  useEffect(() => {
    backfillNutritionPantryCheckpoints();
  }, []);

  const pantrySummary = useMemo(() => {
    if (!Array.isArray(pantryItems) || pantryItems.length === 0) return "—";
    return pantryItems
      .slice(0, 12)
      .map((x) => x.name)
      .filter(Boolean)
      .join(", ");
  }, [pantryItems]);

  const effectiveItems = useMemo(() => {
    if (Array.isArray(pantryItems) && pantryItems.length > 0)
      return pantryItems;
    const raw = pantryText.trim();
    if (!raw) return [];
    return parseLoosePantryText(raw);
  }, [pantryItems, pantryText]);

  // Куди лягає позиція — включно з рішенням власника 2026-09-11 про
  // пріоритет `placeFilter` над евристикою для НОВИХ позицій; повний
  // розбір у `resolvePlaceOfWithFilter.ts`.
  const placeOf = (name: unknown): string =>
    resolvePlaceOfWithFilter(pantryItems, name, placeFilter);

  // Увесь шлях запису поповнення (ручний, автоімпорт Сільпо, відкат,
  // підказка «шт чи г?») - у `usePantryReplenishWrite.ts` (Hard Rule #18).
  const {
    upsertItem,
    upsertItemForAutoImport,
    revertReplenish,
    ambiguousPantryItems,
    resolveAmbiguousPantryItem,
    dismissAmbiguousPantryItem,
  } = usePantryReplenishWrite({
    pantryItems,
    placeOf,
    setPantries,
    onItemsAdded,
  });

  const removeItem = (name: string) => {
    // Match-ключ з обох боків: старі записи лежать у нижньому регістрі,
    // нові — як їх ввели, і видалення має ловити і ті, і ті.
    const n = matchFoodName(name);
    if (!n) return;
    const target = pantryItems.find((x) => matchFoodName(x.name) === n);
    if (!target) return;
    setPantries((cur) =>
      updatePantry(cur, target.pantryId, (p) => ({
        ...p,
        items: (Array.isArray(p.items) ? p.items : []).filter(
          (x) => matchFoodName(x?.name) !== n,
        ),
      })),
    );
    // W1-PANTRY-APPEND стадія 2 — позиція прибирається цілком: чекпойнт
    // 'adjust' на 0, а не вигадана 'consume'-дельта (не знаємо, ЩО саме
    // сталось із залишком) — симетрично до `removeItemAt` нижче.
    appendNutritionPantryEvent({
      id: null,
      pantryId: target.pantryId,
      itemId: target.id ?? null,
      itemKey: canonicalFoodKey(n),
      kind: "adjust",
      deltaQty: null,
      absQty: 0,
      unit: null,
      source: "manual",
      mealId: null,
    });
  };

  /**
   * Легасі-шлях: комора, набита сирим текстом до появи структурованих
   * позицій. Текст переїжджає в дефолтне місце ОДНИМ блоком і в тому ж
   * порядку — розкладати його по місцях тут не можна, бо індекси рядків
   * зараз і є адресами редагування; місце ставиться потім, руками або
   * дією «розкласти по місцях».
   */
  const ensureStructuredItems = () => {
    if (pantryItems.length > 0) return true;
    if (effectiveItems.length === 0) return false;
    setPantries((cur) =>
      updatePantry(cur, draftPantry?.id ?? DEFAULT_PLACE_ID, (p) => ({
        ...p,
        items: effectiveItems.map((x) => ({
          // data-40: позиція вперше потрапляє в список — їй видається id.
          id: x?.id || newPantryItemId(),
          name: displayFoodName(x?.name),
          qty: x?.qty ?? null,
          unit: x?.unit ?? null,
          notes: x?.notes ?? null,
        })),
      })),
    );
    return true;
  };

  const editItemAt = (idx: number) => {
    if (!ensureStructuredItems()) return;
    const cur = pantryItems[idx] ?? effectiveItems[idx];
    if (!cur) return;
    // Поле «Назва» в редакторі показує людині її ж назву — display, не match.
    const curName = displayFoodName(cur.name) || "Продукт";
    setItemEdit({
      open: true,
      idx,
      name: curName,
      qty: cur.qty != null ? String(cur.qty) : "",
      unit: cur.unit != null ? String(cur.unit) : "",
      err: "",
      pantryId: pantryItems[idx]?.pantryId ?? "",
      // Індекс редактор тримає від відкриття, а pull може зсунути позиції:
      // адресою для збереження править id.
      itemId: pantryItems[idx]?.id ?? "",
    });
  };

  const removeItemAt = (idx: number) => {
    if (!ensureStructuredItems()) return;
    // Читаємо адресу ДО setPantries — той самий закриттєвий патерн, що вже
    // працює у `editItemAt` вище. Коли позиції щойно народились із тексту,
    // `pantryItems` цього рендера їх ще не бачить, тож фолбек на дефолтне
    // місце з тим самим індексом — це рівно те, що записав
    // `ensureStructuredItems`.
    const target = pantryItems[idx];
    const pantryId = target?.pantryId ?? draftPantry?.id ?? DEFAULT_PLACE_ID;
    const removedName = target?.name ?? effectiveItems[idx]?.name;
    setPantries((curPantries) =>
      updatePantry(curPantries, pantryId, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        const at = target ? localIndexOf(curPantries, target) : idx;
        if (at >= 0) items.splice(at, 1);
        return { ...p, items };
      }),
    );
    // W1-PANTRY-APPEND стадія 2 — симетрично до `removeItem`: чекпойнт
    // 'adjust' на 0, не вигадана 'consume'-дельта.
    const n = matchFoodName(removedName);
    if (n) {
      appendNutritionPantryEvent({
        id: null,
        pantryId,
        itemId: target?.id ?? null,
        itemKey: canonicalFoodKey(n),
        kind: "adjust",
        deltaQty: null,
        absQty: 0,
        unit: null,
        source: "manual",
        mealId: null,
      });
    }
  };

  /**
   * Зберігає редагування позиції: назва, кількість, одиниця.
   *
   * Назва тут — універсальний запобіжник проти помилки евристики згортання
   * чи категоризації: будь-яку з них можна виправити за два тапи, не
   * видаляючи позицію. Перейменування варіантів НЕ чіпає.
   *
   * AI-DANGER: ручна зміна кількості СКИДАЄ варіанти. Інакше інваріант
   * «сума варіантів = кількість позиції» ламався б мовчки: людина ставить
   * число від руки, а ми не знаємо, з якої саме покупки воно взялось.
   * Чесніше втратити розклад, ніж показувати суму, якої немає.
   */
  const onSaveItemEdit = (
    idx: number,
    name: string | null,
    qty: number | string | null,
    unit: string | null,
    nextPantryId?: string | null,
  ) => {
    // `setPantries`-updater виконується синхронно (React зве його одразу,
    // щоб порахувати наступний стан) — той самий патерн, що вже несе
    // `consumePantryItem` нижче для передачі значень поза замикання.
    const target = itemEdit.itemId
      ? pantryItems.find((x) => x.id === itemEdit.itemId)
      : pantryItems[idx];
    if (itemEdit.itemId && !target) {
      // Позицію вже прибрав інший пристрій: правити нікого.
      setItemEdit((s) => ({ ...s, open: false }));
      return;
    }
    const pantryId = target?.pantryId ?? draftPantry?.id ?? DEFAULT_PLACE_ID;
    let editedName: string | null = null;
    let editedQty: number | null = null;
    setPantries((curPantries) =>
      updatePantry(curPantries, pantryId, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        const localIdx = target ? localIndexOf(curPantries, target) : idx;
        const item = items[localIdx];
        if (!item) return p;
        const qtyNum = qty == null || qty === "" ? null : Number(qty);
        const normalizedQty =
          qtyNum != null && Number.isFinite(qtyNum) ? qtyNum : null;
        const nextName = displayFoodName(name) || item.name;
        editedName = nextName;
        editedQty = normalizedQty;
        const qtyChanged = normalizedQty !== item.qty || unit !== item.unit;
        items[localIdx] = {
          ...item,
          name: nextName,
          qty: normalizedQty,
          unit,
          ...(qtyChanged ? { sources: null } : {}),
        };
        return { ...p, items };
      }),
    );
    setItemEdit((s) => ({ ...s, open: false }));
    // Переїзд — після збереження правок і тільки якщо місце справді інше.
    if (nextPantryId && target && nextPantryId !== target.pantryId) {
      movePlacedItem(target, nextPantryId);
    }
    // W1-PANTRY-APPEND стадія 2 — ручне редагування qty = чекпойнт 'adjust',
    // це буквально "тепер знаю, що насправді X". Пропускаємо, коли юзер
    // очистив кількість (null) — без числа чекпойнт нести нічого (ADR §3.1).
    const n = matchFoodName(editedName);
    if (n && editedQty != null) {
      appendNutritionPantryEvent({
        id: null,
        pantryId,
        itemId: target?.id ?? null,
        itemKey: canonicalFoodKey(n),
        kind: "adjust",
        deltaQty: null,
        absQty: editedQty,
        unit,
        source: "manual",
        mealId: null,
      });
    }
  };

  // Списання з комори, вибір варіанта і відкат списання (OD-27 Х-4 а) - у
  // `usePantryConsumeWrite.ts` (Hard Rule #18).
  const {
    consumePantryItem,
    variantChoice,
    resolveVariantChoice,
    revertConsume,
  } = usePantryConsumeWrite({ pantryItems, setPantries });

  const setPantryText = (text: string) => {
    const id = draftPantry?.id ?? DEFAULT_PLACE_ID;
    setPantries((cur) => updatePantry(cur, id, (p) => ({ ...p, text })));
  };

  // AI-CONTEXT: розбір списку ніколи не має лишати користувача з нулем
  // позицій. Сервер віддає 200 з порожнім `items`, коли модель обірвала
  // JSON (`extractJsonFromText` повертає null), тому фолбек на локальний
  // regex-парсер висить і на `onSuccess`, і на `onError`. Результат не
  // мерджиться одразу — лягає у превʼю, яке підтверджує користувач.
  const applyParseResult = (
    pantryId: string,
    text: string,
    aiItems: unknown,
  ) => {
    const fromAi = Array.isArray(aiItems)
      ? normalizeIncomingItems(aiItems as PantryItem[])
      : [];
    if (fromAi.length > 0) {
      setParsePreview({ items: fromAi, source: "ai", pantryId });
      return true;
    }
    const local = parseLoosePantryText(text);
    if (local.length > 0) {
      setParsePreview({ items: local, source: "local", pantryId });
      return true;
    }
    return false;
  };

  const parsePantryMutation = useMutation({
    mutationFn: ({ pantryId, text }: ParsePantryVariables) => {
      if (!text) throw new Error("Надиктуй/впиши список продуктів.");
      return nutritionApi
        .parsePantry({ text, locale: "uk-UA" })
        .then((data) => ({
          data,
          pantryId,
          text,
        }));
    },
    onMutate: () => {
      setBusy(true);
      setErr("");
      setParsePreview(null);
      setStatusText("Розбираю список…");
    },
    onSuccess: ({ data, pantryId, text }) => {
      if (!applyParseResult(pantryId, text, data?.items)) {
        setErr(PARSE_FAILED);
      }
    },
    onError: (err, { pantryId, text }) => {
      if (!applyParseResult(pantryId, text, null)) {
        setErr(formatNutritionError(err, PARSE_FAILED));
      }
    },
    onSettled: () => {
      setStatusText("");
      setBusy(false);
    },
  });

  const confirmParsePreview = (items: PantryItem[]) => {
    if (!items.length || !parsePreview) return;
    const draftId = parsePreview.pantryId;
    const placements = items.map((item) => ({
      name: item.name,
      pantryId: placeOf(item.name),
    }));
    setPantries((cur) =>
      mergeItemsIntoPlaces(
        cur.map((p) => (p.id === draftId ? { ...p, text: "" } : p)),
        items,
        placeOf,
      ),
    );
    setParsePreview(null);
    onItemsAdded?.(placements);
  };

  const dismissParsePreview = () => setParsePreview(null);

  const draftPantryId = draftPantry?.id ?? DEFAULT_PLACE_ID;

  /**
   * `PantryParsePreview` викликає це одразу при тапі на «шт»/«г» для
   * неоднозначного рядка (не чекаючи «Підтвердити») — вибір запамʼятовується
   * незалежно від того, підтвердить людина весь список чи скасує його.
   */
  const rememberAmbiguousChoice = (name: string, unit: AmbiguousPantryUnit) => {
    rememberAmbiguousUnitChoice(canonicalFoodKey(name), unit);
  };

  const parsePantry = useCallback(
    () =>
      guard("pantry-parse", () =>
        parsePantryMutation.mutate({
          pantryId: draftPantryId,
          text: pantryText.trim(),
        }),
      ),
    [guard, parsePantryMutation, draftPantryId, pantryText],
  );

  /**
   * Зміна місця в один дотик. Ledger дізнається про переїзд двома
   * чекпойнтами, а не вигаданою дельтою: у старому місці залишок стає 0,
   * у новому — рівно тим, що приїхало. Мовчазний перенос зробив би
   * залишок місця неправдою, а комора — це журнал (ADR-0077).
   */
  const movePlacedItem = (src: PlacedPantryItem, targetId: string) => {
    if (src.pantryId === targetId) return;
    setPantries((cur) => {
      const localIdx = localIndexOf(cur, src);
      if (localIdx < 0) return cur;
      const res = movePantryItem(
        cur,
        { pantryId: src.pantryId, localIdx },
        targetId,
      );
      return res.moved ? res.pantries : cur;
    });
    const key = matchFoodName(src.name);
    if (!key) return;
    const itemKey = canonicalFoodKey(key);
    appendNutritionPantryEvent({
      id: null,
      pantryId: src.pantryId,
      itemId: src.id ?? null,
      itemKey,
      kind: "adjust",
      deltaQty: null,
      absQty: 0,
      unit: null,
      source: "manual",
      mealId: null,
    });
    if (src.qty != null && Number.isFinite(src.qty)) {
      appendNutritionPantryEvent({
        id: null,
        pantryId: targetId,
        itemId: src.id ?? null,
        itemKey,
        kind: "adjust",
        deltaQty: null,
        absQty: src.qty,
        unit: src.unit ?? null,
        source: "manual",
        mealId: null,
      });
    }
  };

  const moveItemTo = (idx: number, targetId: string) => {
    const src = pantryItems[idx];
    if (src) movePlacedItem(src, targetId);
  };

  return {
    ...places,
    pantries,
    placeFilter,
    setPlaceFilter,
    moveItemTo,
    pantryText,
    pantryItems,
    newItemName,
    setNewItemName,
    itemEdit,
    setItemEdit,
    upsertItem,
    upsertItemForAutoImport,
    revertReplenish,
    ambiguousPantryItems,
    resolveAmbiguousPantryItem,
    dismissAmbiguousPantryItem,
    rememberAmbiguousChoice,
    removeItem,
    editItemAt,
    removeItemAt,
    onSaveItemEdit,
    setPantryText,
    effectiveItems,
    pantrySummary,
    parsePantry,
    parsePreview,
    confirmParsePreview,
    dismissParsePreview,
    pantryStorageErr,
    consumePantryItem,
    variantChoice,
    resolveVariantChoice,
    revertConsume,
  };
}
