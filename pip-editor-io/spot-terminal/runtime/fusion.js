import { mergeLive, mergeSnapshotKlines } from "./normalize.js";
import { acknowledgeKlines } from "./stomp.js";

// Commands must publish only fused view state. Exposing an HTTP snapshot first
// creates a visible intermediate frame before STOMP overlays are reapplied.
export function fuseState(state, live) {
  return mergeLive(state, live);
}

export function fuseSnapshot(previous, snapshot, live) {
  acknowledgeKlines(live, snapshot.klines);
  return fuseState({ ...previous, ...snapshot,
    klines: mergeSnapshotKlines(previous.klines, snapshot.klines, Date.now(), live.durationMs) }, live);
}
