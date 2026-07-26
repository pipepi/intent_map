import assert from "node:assert/strict";
import test from "node:test";

import { cameraForTouchGesture } from "../app/runtime/camera.ts";

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
