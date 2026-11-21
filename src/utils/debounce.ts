export function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  // Timer is per debounced function, so independent inputs don't cancel each other.
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: Parameters<T>) => {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = undefined;
      func(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
  };
  return debounced;
}
