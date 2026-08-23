/** Pure browser-like navigation for one stable workspace window. */
import type { ProjectionNavigationState, ProjectionRouteEntry } from "../contracts/package-types.ts";

export const initialNavigation = (entry: ProjectionRouteEntry): ProjectionNavigationState => ({ entries: [entry], index: 0, semanticScale: 1 });
export const currentRoute = (state: ProjectionNavigationState) => state.entries[state.index];

export const navigateProjection = (state: ProjectionNavigationState, entry: ProjectionRouteEntry): ProjectionNavigationState => ({
  entries: [...state.entries.slice(0, state.index + 1), entry], index: state.index + 1, semanticScale: 1,
});

/** Switching an observation at the same depth must not create a false semantic parent. */
export const replaceCurrentProjection = (state: ProjectionNavigationState, entry: ProjectionRouteEntry): ProjectionNavigationState => ({
  entries: [...state.entries.slice(0, state.index), entry], index: state.index, semanticScale: 1,
});

export const moveProjectionHistory = (state: ProjectionNavigationState, delta: -1 | 1): ProjectionNavigationState => ({
  entries: state.entries, index: Math.max(0, Math.min(state.entries.length - 1, state.index + delta)), semanticScale: 1,
});

export const replaceSemanticScale = (state: ProjectionNavigationState, semanticScale: number): ProjectionNavigationState => ({
  ...state, semanticScale: Math.max(.6, Math.min(1.7, semanticScale)),
});

export const exportedNavigation = (state: ProjectionNavigationState): ProjectionNavigationState => ({
  entries: [currentRoute(state)], index: 0, semanticScale: 1,
});
