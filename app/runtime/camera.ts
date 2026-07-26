import type { CameraState } from "./model";

type Point = { x: number; y: number };

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
