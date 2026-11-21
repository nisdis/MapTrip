import { useCallback, useRef } from "react";

/** Ref callback that reports an element's height now and whenever it changes. */
export function useReportHeight(onHeight: (px: number) => void) {
  const observer = useRef<ResizeObserver | null>(null);
  const cb = useRef(onHeight);
  cb.current = onHeight;
  return useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) {
      cb.current(0);
      return;
    }
    cb.current(el.offsetHeight);
    observer.current = new ResizeObserver(() => cb.current(el.offsetHeight));
    observer.current.observe(el);
  }, []);
}
