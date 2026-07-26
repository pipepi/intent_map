import type { CameraState } from "./model";

type Point = { x: number; y: number };

export const scaleForWheelGesture = (
  currentScale: number,
  deltaY: number,
  minScale: number,
  maxScale: number,
) => {
  if (deltaY === 0) return currentScale;
  const direction = deltaY < 0 ? 1 : -1;
  const logarithmicStep = Math.min(
    0.2,
    Math.max(0.04, Math.abs(deltaY) * 0.002),
  );
  return Math.max(
    minScale,
    Math.min(maxScale, currentScale * Math.exp(direction * logarithmicStep)),
  );
};

export const cameraForTouchGesture = (
  startCamera: CameraState,
  startCenter: Point,
  currentCenter: Point,
  startDistance: number | undefined,
  currentDistance: number | undefined,
  minScale: number,
  maxScale: number,
): CameraState => {
  const ratio =
    startDistance && currentDistance
      ? currentDistance / startDistance
      : 1;
  const scale = Math.max(
    minScale,
    Math.min(maxScale, startCamera.scale * ratio),
  );
  const worldX = (startCenter.x - startCamera.x) / startCamera.scale;
  const worldY = (startCenter.y - startCamera.y) / startCamera.scale;
  return {
    scale,
    x: currentCenter.x - worldX * scale,
    y: currentCenter.y - worldY * scale,
  };
};
