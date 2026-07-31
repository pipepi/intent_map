"use client";

import { createScopeNavigationOps, type ScopeNavigationDeps } from "./scope-navigation";

export function useScopeNavigationSession(deps: ScopeNavigationDeps) {
  const operations = createScopeNavigationOps(deps);
  return operations;
}
