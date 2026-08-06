"use client";

import { useEffect } from "react";

import type { RuntimeCommand } from "../runtime/pipeline";

export type SupportedRuntimeCommand =
  | "NEW_DOCUMENT"
  | "IMPORT_REQUEST"
  | "EXPORT_DOCUMENT"
  | "UNDO"
  | "REDO"
  | "AUTO_LAYOUT"
  | "PUBLISH_MODULE"
  | "ADD_BUSINESS_CHILD"
  | "DUPLICATE_NODE"
  | "DELETE_NODE"
  | "DUPLICATE_APP_NODE"
  | "DELETE_APP_NODE"
  | "RESET_APP_GRAPH"
  | "NAVIGATE_APP_PARENT"
  | "FIT_SCOPE"
  | "RESET_CAMERA";

export type RuntimeCommandActions = Record<
  SupportedRuntimeCommand,
  () => void | Promise<void>
>;

const supportedCommands = new Set<SupportedRuntimeCommand>([
  "NEW_DOCUMENT",
  "IMPORT_REQUEST",
  "EXPORT_DOCUMENT",
  "UNDO",
  "REDO",
  "AUTO_LAYOUT",
  "PUBLISH_MODULE",
  "ADD_BUSINESS_CHILD",
  "DUPLICATE_NODE",
  "DELETE_NODE",
  "DUPLICATE_APP_NODE",
  "DELETE_APP_NODE",
  "RESET_APP_GRAPH",
  "NAVIGATE_APP_PARENT",
  "FIT_SCOPE",
  "RESET_CAMERA",
]);

function isSupportedCommand(type: string): type is SupportedRuntimeCommand {
  return supportedCommands.has(type as SupportedRuntimeCommand);
}

export function useRuntimeCommandExecutor(
  commands: RuntimeCommand[],
  actions: RuntimeCommandActions,
) {
  useEffect(() => {
    if (!commands.length) return;
    const timer = window.setTimeout(() => {
      for (const command of commands) {
        if (!isSupportedCommand(command.type)) continue;
        void actions[command.type]();
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // Each immutable command batch is intentionally executed exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands]);
}
