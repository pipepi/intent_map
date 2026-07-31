"use client";

import type { ChangeEventHandler, ComponentProps, RefObject } from "react";

import { Workspace } from "../runtime/workspace";

export interface EditorWorkspaceProps
  extends Omit<ComponentProps<typeof Workspace>, "freeCanvas"> {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onImportDocument: ChangeEventHandler<HTMLInputElement>;
  canvas: ComponentProps<typeof Workspace>["freeCanvas"];
}

export function EditorWorkspace({
  fileInputRef,
  onImportDocument,
  canvas,
  ...workspaceProps
}: EditorWorkspaceProps) {
  return (
    <main className="everything-app">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.intent-map.json,.pip"
        hidden
        onChange={onImportDocument}
      />
      <Workspace {...workspaceProps} freeCanvas={canvas} />
    </main>
  );
}
