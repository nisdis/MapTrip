
let timeout: number | undefined;

export function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {

  return (...args: Parameters<T>) => {
    if (timeout) {
      console.log('clear')
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      console.log("run")
      func(...args);
      clearTimeout(timeout);
    }, wait + 500);
  };
}