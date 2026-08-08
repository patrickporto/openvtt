export function debounce<T extends (...args: any[]) => any>(fn: T, wait = 100) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = undefined;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    clearTimeout(timeout);
    timeout = undefined;
  };
  debounced.flush = (...args: Parameters<T>) => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
      timeout = undefined;
      fn(...args);
    }
  };
  return debounced;
}
