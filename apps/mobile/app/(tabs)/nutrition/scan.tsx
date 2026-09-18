/**
 * Deep-link target `sergeant://food/scan` + stack push з AddMealSheet.
 * Нативний зчитувач: `expo-camera` (CameraView) + `/api/barcode`.
 */
import { NutritionBarcodeScanScreen } from "@/modules/nutrition/components/NutritionBarcodeScanScreen";

export default function NutritionScanScreen() {
  return <NutritionBarcodeScanScreen />;
}
