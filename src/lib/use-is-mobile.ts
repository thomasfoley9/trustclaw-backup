"use client";

import { useEffect, useState } from "react";

// True below Tailwind's `md` breakpoint (768px). Used to swap desktop side
// panes for mobile-native affordances (e.g. a bottom Sheet).
const MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isMobile;
}
