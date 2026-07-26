import assert from "node:assert/strict";
import test from "node:test";

import {
  cameraForTouchGesture,
  scaleForWheelGesture,
} from "../app/runtime/camera.ts";

test("turns small precision-touchpad deltas into visible camera zoom", () => {
  assert.ok(scaleForWheelGesture(1, -1, 0.5, 2) > 1.04);
  assert.ok(scaleForWheelGesture(1, 1, 0.5, 2) < 0.97);
  assert.equal(scaleForWheelGesture(2, -120, 0.5, 2), 2);
  assert.equal(scaleForWheelGesture(0.5, 120, 0.5, 2), 0.5);
});

test("single-touch movement pans without changing scale", () => {
  assert.deepEqual(
    cameraForTouchGesture(
      { scale: 1, x: 10, y: 20 },
      { x: 100, y: 100 },
      { x: 125, y: 80 },
      undefined,
      undefined,
      0.5,
      2,
    ),
    { scale: 1, x: 35, y: 0 },
  );
});

test("two-touch pinch zooms around the gesture center", () => {
  assert.deepEqual(
    cameraForTouchGesture(
      { scale: 1, x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      100,
      200,
      0.5,
      2,
    ),
    { scale: 2, x: -100, y: -100 },
  );
});

test("pinch scale respects camera limits while preserving its anchor", () => {
  assert.deepEqual(
    cameraForTouchGesture(
      { scale: 1, x: 0, y: 0 },
      { x: 80, y: 60 },
      { x: 90, y: 70 },
      100,
      400,
      0.5,
      2,
    ),
    { scale: 2, x: -70, y: -50 },
  );
});
