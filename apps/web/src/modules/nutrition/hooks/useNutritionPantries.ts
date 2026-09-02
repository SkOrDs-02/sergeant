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
import { formatNutritionError } from "../lib/nutritionErrors";
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
  normalizeUnit,
  parseLoosePantryText,
  type PantryItem,
} from "../lib/pantryTextParser";
import {
  applyConsumeToPantryItem,
  buildPlacedItems,
  ensureStoragePlaces,
  mergeItemsIntoPlaces,
  movePantryItem,
  resolvePlaceForItem,
  DEFAULT_PLACE_ID,
  type PantryItemSource,
} from "@sergeant/nutrition-domain";
import { usePantryPlaces } from "./usePantryPlaces";
import {
  getRememberedAmbiguousUnit,
  rememberAmbiguousUnitChoice,
  type AmbiguousPantryUnit,
} from "../lib/pantryAmbiguousUnitMemory";

export interface UseNutritionPantriesParams {
  setBusy: Dispatch<SetStateAction<boolean>>;
  setErr: Dispatch<SetStateAction<string>>;
  setStatusText: Dispatch<SetStateAction<string>>;
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

/**
 * Єдина нормалізація для всіх шляхів наповнення комори: ручний ввід,
 * сканер, відповідь AI. Раніше AI-шлях клав `items` у стан як є, тому
 * модель, що повернула «гр» замість «г», плодила окрему позицію поруч
 * із уже наявною.
 *
 * `name` проходить через `displayFoodName`, а не через match-нормалізацію:
 * зі сканера сюди приходять бренди («Coca-Cola Zero», «Яготинське»), і
 * зіставлення все одно робиться окремим ключем.
 */
function normalizeIncomingItems(raw: PantryItem | PantryItem[]): PantryItem[] {
  return (Array.isArray(raw) ? raw : [raw])
    .map((item) => ({
      name: displayFoodName(item?.name),
      qty:
        item?.qty == null || !Number.isFinite(Number(item.qty))
          ? null
          : Number(item.qty),
      unit: item?.unit != null ? normalizeUnit(item.unit) : null,
      notes: item?.notes ?? null,
      sources: Array.isArray(item?.sources) ? item.sources : null,
    }))
    .filter((item) => item.name);
}

/**
 * Якщо цей продукт уже отримував явний вибір «шт чи г?» (UX-4), застосовує
 * його мовчки і знімає `ambiguousQty` — саме тому вдруге не питаємо про той
 * самий товар. Продукт, про який ще не питали, повертається без змін: тоді
 * прапорець доходить до UI і викликає підказку.
 */
function resolveAmbiguousItemWithMemory(item: PantryItem): PantryItem {
  if (!item.ambiguousQty) return item;
  const remembered = getRememberedAmbiguousUnit(canonicalFoodKey(item.name));
  if (!remembered) return item;
  const { ambiguousQty: _drop, ...rest } = item;
  void _drop;
  return { ...rest, unit: remembered };
}

export function useNutritionPantries({
  setBusy,
  setErr,
  setStatusText,
}: UseNutritionPantriesParams) {
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
  if (sqliteCacheTick !== prevSqliteTick) {
    setPrevSqliteTick(sqliteCacheTick);
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt !== null) {
      setPantries(ensureStoragePlaces(cache.pantries));
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
  }));

  const [pantryStorageErr, setPantryStorageErr] = useState("");

  const [parsePreview, setParsePreview] = useState<PantryParsePreview | null>(
    null,
  );

  // UX-4 (аудит 2026-09-01) — позиції з `upsertItem`, чиє хвостове число без
  // одиниці лишилось неоднозначним ПІСЛЯ перевірки памʼяті (нижче). Не
  // мерджаться в комору, доки людина не тапне «шт» чи «г» — один тап у
  // тому самому потоці, без модалки (`PantryAmbiguousQtyPrompt`).
  const [ambiguousPantryItems, setAmbiguousPantryItems] = useState<
    PantryItem[]
  >([]);

  // DCRUD-007: skip the mount run — it would persist the UNHYDRATED
  // initial state (LS is tombstoned after the first boot, so that state
  // is an empty default) while the SQLite cache may already be warm;
  // the resulting dual-write diff soft-deletes every pantry item the
  // user has. Before the value-based diff fix this wipe was silently
  // "healed" by the spurious-upsert feedback loop; now it must simply
  // never fire. Real mutations and the overlay hydration re-run the
  // effect with meaningful state.
  const pantriesHydratedRef = useRef(false);
  useEffect(() => {
    if (!pantriesHydratedRef.current) {
      pantriesHydratedRef.current = true;
      return;
    }
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

  /**
   * Куди лягає позиція. Порядок тут і є гейтом «ручне сильніше за
   * автовизначення»: місце вже наявної позиції виграє вгадування завжди,
   * тож доливання молока не тягне його назад у холодильник із балкона.
   */
  const placeOf = (name: unknown) => resolvePlaceForItem(pantryItems, name);

  // Витягнуто з колишнього тіла `upsertItem`: злиття по місцях + одна
  // 'replenish'-подія на позицію з відомою кількістю. Використовується і
  // прямим шляхом (немає неоднозначних чисел), і з дозволу підказки
  // «шт чи г?» нижче — обидва мають записати рівно те саме.
  const mergeParsedItems = (items: PantryItem[]) => {
    if (!items.length) return;
    setPantries((cur) => mergeItemsIntoPlaces(cur, items, placeOf));
    // W1-PANTRY-APPEND стадія 2 — паралельно до запису `qty` вище: одна
    // 'replenish'-подія на кожну позицію з відомою кількістю. Позиції без
    // qty (гола назва — «сіль») дельту не несуть, тож пропускаємо.
    for (const item of items) {
      if (item.qty == null || !Number.isFinite(item.qty)) continue;
      appendNutritionPantryEvent({
        id: null,
        pantryId: placeOf(item.name),
        itemId: null,
        itemKey: canonicalFoodKey(item.name),
        kind: "replenish",
        deltaQty: item.qty,
        absQty: null,
        unit: item.unit,
        source: "manual",
        mealId: null,
      });
    }
  };

  const upsertItem = (raw: string | PantryItem | PantryItem[]) => {
    const parsed =
      typeof raw === "string"
        ? parseLoosePantryText(raw)
        : normalizeIncomingItems(raw);
    if (!parsed.length) return;

    // UX-4 — голе хвостове число без одиниці (`ambiguousQty`) не мерджиться
    // мовчки. Продукт, про який людина вже одного разу відповіла «шт» чи
    // «г», проходить одразу (`resolveAmbiguousItemWithMemory`); решта чекає
    // явного тапу в `PantryAmbiguousQtyPrompt`.
    const resolved = parsed.map(resolveAmbiguousItemWithMemory);
    const ready = resolved.filter((item) => !item.ambiguousQty);
    const pending = resolved.filter((item) => item.ambiguousQty);

    if (ready.length > 0) mergeParsedItems(ready);
    if (pending.length > 0) {
      setAmbiguousPantryItems((cur) => [...cur, ...pending]);
    }
  };

  /**
   * Тап «шт» чи «г» на підказці: пише позицію з обраною одиницею й
   * запамʼятовує вибір для цього продукту (канон nutrition §6 — не питати
   * вдруге про той самий товар). Індекс адресує `ambiguousPantryItems`, не
   * комору.
   */
  const resolveAmbiguousPantryItem = (
    idx: number,
    unit: AmbiguousPantryUnit,
  ) => {
    const item = ambiguousPantryItems[idx];
    if (!item) return;
    rememberAmbiguousUnitChoice(canonicalFoodKey(item.name), unit);
    const { ambiguousQty: _drop, ...rest } = item;
    void _drop;
    mergeParsedItems([{ ...rest, unit }]);
    setAmbiguousPantryItems((cur) => cur.filter((_, i) => i !== idx));
  };

  /** Скасовує додавання позиції з підказки — товар нікуди не пишеться. */
  const dismissAmbiguousPantryItem = (idx: number) => {
    setAmbiguousPantryItems((cur) => cur.filter((_, i) => i !== idx));
  };

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
      itemId: null,
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
    const localIdx = target?.localIdx ?? idx;
    const removedName = target?.name ?? effectiveItems[idx]?.name;
    setPantries((curPantries) =>
      updatePantry(curPantries, pantryId, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        items.splice(localIdx, 1);
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
        itemId: null,
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
    const target = pantryItems[idx];
    const pantryId = target?.pantryId ?? draftPantry?.id ?? DEFAULT_PLACE_ID;
    const localIdx = target?.localIdx ?? idx;
    let editedName: string | null = null;
    let editedQty: number | null = null;
    setPantries((curPantries) =>
      updatePantry(curPantries, pantryId, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
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
      moveItemTo(idx, nextPantryId);
    }
    // W1-PANTRY-APPEND стадія 2 — ручне редагування qty = чекпойнт 'adjust',
    // це буквально "тепер знаю, що насправді X". Пропускаємо, коли юзер
    // очистив кількість (null) — без числа чекпойнт нести нічого (ADR §3.1).
    const n = matchFoodName(editedName);
    if (n && editedQty != null) {
      appendNutritionPantryEvent({
        id: null,
        pantryId,
        itemId: null,
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

  // Вибір варіанта при списанні (рішення 11): показується ЛИШЕ коли
  // варіантів два і більше. Списання спрацьовує всередині збереження
  // прийому їжі, тож зайвий діалог у швидкому сценарії дорожчий за
  // точність — на одному варіанті нічого не питаємо.
  const [variantChoice, setVariantChoice] = useState<{
    itemName: string;
    grams: number;
    sources: readonly PantryItemSource[];
  } | null>(null);

  // AI-CONTEXT: списує gramsConsumed зі складської позиції, конвертуючи грами
  // в її одиницю через `gramsToUnitQty` (@sergeant/nutrition-domain): г/кг —
  // маса 1:1, мл/л — через грубу таблицю густин, шт — через вагу однієї штуки.
  // `null` означає одиницю без масового відображення (напр. уп) — лишаємо
  // позицію без змін. Раніше тут пропускались усі немасові одиниці; конверсія
  // закриває inventory-drift із F15 (page-audit-08-nutrition) і коректно
  // обробляє кейс H2 ("200 г молока" зі "2 л" ≈ 0.19 л, а не вся пляшка).
  //
  // Розподіл між варіантами і видалення вичерпаних живуть у домені
  // (`applyConsumeToPantryItem`) — там же тримається інваріант суми.
  const applyConsume = (
    name: string,
    gramsConsumed: number,
    variantName: string | null,
  ) => {
    const norm = matchFoodName(name);
    if (!norm) return;
    // Списуємо там, де позиція лежить, а не там, куди дивиться екран:
    // прийом їжі не знає й не має знати про фільтр місця.
    const holder = pantryItems.find((x) => matchFoodName(x.name) === norm);
    if (!holder) return;
    const holderId = holder.pantryId;
    let deductedQty: number | null = null;
    let deductedUnit: string | null = null;
    setPantries((cur) =>
      updatePantry(cur, holderId, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        const idx = items.findIndex((x) => matchFoodName(x?.name) === norm);
        if (idx < 0) return p;
        const item = items[idx];
        if (!item) return p;
        const res = applyConsumeToPantryItem(item, gramsConsumed, variantName);
        if (!res) return p;
        deductedQty = res.deducted;
        deductedUnit = res.unit;
        if (res.item === null) {
          items.splice(idx, 1);
        } else {
          items[idx] = res.item;
        }
        return { ...p, items };
      }),
    );
    // W1-PANTRY-APPEND стадія 2 — audit E-2: це саме той шлях, який ADR-0077
    // закриває. 'consume' несе РЕАЛЬНО списану дельту (та сама `deduct`, що
    // й пішла у `qty` вище), а не вигадану — batch-страва все одно дасть
    // N подій на N логів, і це навмисно ВИДИМО, а не приховано (ADR §6).
    if (deductedQty != null) {
      appendNutritionPantryEvent({
        id: null,
        pantryId: holderId,
        itemId: null,
        itemKey: canonicalFoodKey(norm),
        kind: "consume",
        deltaQty: -deductedQty,
        absQty: null,
        unit: deductedUnit,
        source: "meal_log",
        mealId: null,
      });
    }
  };

  const consumePantryItem = (name: string, gramsConsumed: number) => {
    const norm = matchFoodName(name);
    if (!norm) return;
    const target = pantryItems.find((x) => matchFoodName(x?.name) === norm);
    const sources = Array.isArray(target?.sources) ? target.sources : [];
    if (target && sources.length >= 2) {
      setVariantChoice({
        itemName: displayFoodName(target.name),
        grams: gramsConsumed,
        sources,
      });
      return;
    }
    applyConsume(name, gramsConsumed, null);
  };

  /**
   * Закриває вибір варіанта. `null` = «з найстарішого» — і це ж поведінка
   * при закритті діалогу: прийом їжі вже збережено, тож не списати нічого
   * означало б лишити комору з завищеним залишком.
   */
  const resolveVariantChoice = (variantName: string | null) => {
    if (!variantChoice) return;
    applyConsume(variantChoice.itemName, variantChoice.grams, variantName);
    setVariantChoice(null);
  };

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
        setErr("Не вдалось розібрати список. Спробуй перефразувати.");
      }
    },
    onError: (err, { pantryId, text }) => {
      if (!applyParseResult(pantryId, text, null)) {
        setErr(formatNutritionError(err, "Помилка розбору списку"));
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
    setPantries((cur) =>
      mergeItemsIntoPlaces(
        cur.map((p) => (p.id === draftId ? { ...p, text: "" } : p)),
        items,
        placeOf,
      ),
    );
    setParsePreview(null);
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
      parsePantryMutation.mutate({
        pantryId: draftPantryId,
        text: pantryText.trim(),
      }),
    [parsePantryMutation, draftPantryId, pantryText],
  );

  /**
   * Зміна місця в один дотик. Ledger дізнається про переїзд двома
   * чекпойнтами, а не вигаданою дельтою: у старому місці залишок стає 0,
   * у новому — рівно тим, що приїхало. Мовчазний перенос зробив би
   * залишок місця неправдою, а комора — це журнал (ADR-0077).
   */
  const moveItemTo = (idx: number, targetId: string) => {
    const src = pantryItems[idx];
    if (!src || src.pantryId === targetId) return;
    setPantries((cur) => {
      const res = movePantryItem(
        cur,
        { pantryId: src.pantryId, localIdx: src.localIdx },
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
      itemId: null,
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
        itemId: null,
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
  };
}
