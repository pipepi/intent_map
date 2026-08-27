export function captureSellScroll(element) {
  if (!element) return null;
  const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
  return { top: element.scrollTop, pinned: maximum - element.scrollTop <= 3 };
}

export function restoreSellScroll(element, previous) {
  if (!element) return;
  const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
  // The best ask is the bottom row. New views and bottom-pinned views must
  // therefore open at the bottom; preserve an intentional upward inspection.
  element.scrollTop = !previous || previous.pinned
    ? maximum : Math.min(previous.top, maximum);
}
