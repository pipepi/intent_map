"use client";

import {
  createAddBusinessChild,
  createCreateLinkedBusinessNode,
  createDeleteBusinessNode,
  createDuplicateBusinessNode,
  createInsertModule,
  createMoveBusinessNodeStart,
  createPublishModule,
  createResizeBusinessNodeStart,
  createStartPipeDrag,
  createToggleBusinessDisplayMode,
  createToggleBusinessResizeMode,
  type BusinessOpsDeps,
} from "./business-ops";

export function useBusinessAuthoringSession(deps: BusinessOpsDeps) {
  const publish = createPublishModule(deps);
  const insert = createInsertModule(deps);
  const addChild = createAddBusinessChild(deps);
  const duplicate = createDuplicateBusinessNode(deps);
  const createLinked = createCreateLinkedBusinessNode(deps);
  const remove = createDeleteBusinessNode(deps);
  const startDrag = createStartPipeDrag(deps);
  const moveStart = createMoveBusinessNodeStart(deps);
  const resizeStart = createResizeBusinessNodeStart(deps);
  const toggleResizeMode = createToggleBusinessResizeMode(deps);
  const toggleDisplayMode = createToggleBusinessDisplayMode(deps);

  return {
    nodes: {
      addChild,
      duplicate,
      duplicateSelected: () => duplicate(deps.selectedBusinessNode.id),
      remove,
      removeSelected: () => remove(deps.selectedBusinessNode.id),
      createLinked,
    },
    geometry: {
      moveStart,
      resizeStart,
      toggleResizeMode,
      toggleDisplayMode,
    },
    pipes: { startDrag },
    modules: { publish, insert },
  };
}
