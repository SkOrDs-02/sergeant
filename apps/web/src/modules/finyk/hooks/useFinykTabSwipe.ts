import { useCallback, useEffect, useRef } from "react";
import { useSwipeNavigation } from "@shared/hooks/useSwipeNavigation";
import { NAV_IDS } from "../components/finykNav";
import type { FinykPage } from "../lib/finykRouter";

const SWIPE_THRESHOLD_PX = 60;

export interface UseFinykTabSwipeArgs {
  page: FinykPage;
  navigate: (p: FinykPage | string) => void;
}

export function useFinykTabSwipe({ page, navigate }: UseFinykTabSwipeArgs) {
  const curPageIdx = NAV_IDS.indexOf(page);
  const idxRef = useRef(curPageIdx);
  idxRef.current = curPageIdx;
  const navRef = useRef(navigate);
  navRef.current = navigate;

  const onSwipeLeft = useCallback(() => {
    const next = idxRef.current + 1;
    if (next >= 0 && next < NAV_IDS.length) {
      // `next` is bounds-checked against `NAV_IDS.length`; `!` is required
      // because `noUncheckedIndexedAccess` widens the lookup to
      // `string | undefined` even when the index is provably in range.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      navRef.current(NAV_IDS[next]!);
    }
  }, []);

  const onSwipeRight = useCallback(() => {
    const next = idxRef.current - 1;
    if (next >= 0 && next < NAV_IDS.length) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      navRef.current(NAV_IDS[next]!);
    }
  }, []);

  const swipe = useSwipeNavigation({
    onSwipeLeft,
    onSwipeRight,
    threshold: SWIPE_THRESHOLD_PX,
    atStart: curPageIdx === 0,
    atEnd: curPageIdx === NAV_IDS.length - 1,
  });

  useEffect(() => {
    return () => {
      idxRef.current = 0;
      navRef.current = () => {};
    };
  }, []);

  return { swipe, threshold: SWIPE_THRESHOLD_PX };
}
