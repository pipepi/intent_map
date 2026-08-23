export function screenToFlowWorld(point, transform) {
  const zoom = Number.isFinite(transform.zoom) && transform.zoom > 0 ? transform.zoom : 1;
  return { x: (point.x - transform.panX) / zoom, y: (point.y - transform.panY) / zoom };
}

export function screenToElementLocal(point, rect, size) {
  const scaleX = rect.width / size.width, scaleY = rect.height / size.height;
  return { x: (point.x - rect.left) / scaleX, y: (point.y - rect.top) / scaleY };
}

export function flowTransformFor(host) {
  const style = getComputedStyle(host);
  return {
    panX: Number.parseFloat(style.getPropertyValue("--projection-pan-x")) || 0,
    panY: Number.parseFloat(style.getPropertyValue("--projection-pan-y")) || 0,
    zoom: Number.parseFloat(style.getPropertyValue("--projection-zoom")) || 1,
  };
}
