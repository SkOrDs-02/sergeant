/**
 * Floating sync-status pill. v1 CloudSync context is gone; the overlay
 * now reads only the remaining status hook and stays silent while idle.
 */
import { SafeAreaView } from "react-native-safe-area-context";

import { SyncStatusIndicator } from "./SyncStatusIndicator";

export function SyncStatusOverlay() {
  return (
    <SafeAreaView
      edges={["top"]}
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        alignItems: "center",
      }}
    >
      <SyncStatusIndicator variant="silent-when-idle" />
    </SafeAreaView>
  );
}
