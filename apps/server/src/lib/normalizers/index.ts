export {
  normalizeOFFBarcode,
  normalizeOFFSearch,
  type OFFProduct,
  type OFFSearchProduct,
  type NormalizedOFFBarcode,
  type NormalizedOFFSearch,
} from "./off.js";

export {
  normalizeUSDABarcode,
  normalizeUSDASearch,
  FDC_NUTRIENT,
  type USDAFood,
  type USDAFoodNutrient,
  type USDASearchFood,
  type NormalizedUSDABarcode,
  type NormalizedUSDASearch,
} from "./usda.js";

export {
  toNumberOrNull,
  normalizeMonoAccount,
  normalizeMonoTransaction,
  type MonoAccountRow,
  type MonoTransactionRow,
  type NormalizedMonoAccount,
  type NormalizedMonoTransaction,
} from "./mono.js";

export {
  normalizeUPCitemdb,
  type UPCitemdbItem,
  type UPCitemdbResponse,
  type NormalizedUPCitemdbBarcode,
} from "./upcitemdb.js";

export { UK_TO_EN, translateFirstToken } from "./uk-to-en.js";
