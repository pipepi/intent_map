/** Gesture-driven semantic zoom uses hysteresis so a partial transition always settles safely. */
import type { ProjectionNavigationState, ProjectionRouteEntry } from "../contracts/package-types.ts";
import { moveProjectionHistory, navigateProjection, replaceSemanticScale } from "./projection-navigation.ts";

export const semanticProgress = (scale: number) => scale >= 1.7 || scale <= .6 ? 1
  : scale > 1.5 ? (scale - 1.5) / .2 : scale < .7 ? (.7 - scale) / .1 : 0;

export function applySemanticScale(state: ProjectionNavigationState, scale: number, forward?: ProjectionRouteEntry) {
  if (scale >= 1.7 && forward) return navigateProjection(state, forward);
  if (scale <= .6 && state.index > 0) return moveProjectionHistory(state, -1);
  return replaceSemanticScale(state, scale);
}
