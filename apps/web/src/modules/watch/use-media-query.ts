"use client";

import { useEffect, useState } from "react";

/** 响应式断点：SSR / 首帧返回 false（与 hydration 一致），挂载后按 `matchMedia` 更新。 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
