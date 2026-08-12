import type { CanvasNode } from "./types";

export type ElementPurpose = "control" | "preview";
export type ElementDeclaration = { id: string; tag: string; purpose: ElementPurpose };
export type ElementPluginManifest = {
  format: "intent-element-plugin";
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  entry: "entry.mjs";
  elements: ElementDeclaration[];
  permissions: string[];
  sourcePaths: string[];
  sourceSha256: string;
  entrySha256: string;
  communityTags: string[];
  redistributable: boolean;
};

export type ElementReference = {
  pluginId: string;
  elementId: string;
  sourceField: string;
  properties?: Record<string, string>;
};

export type NodeTypePackage = {
  format: "intent-node-type-plugin";
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  dependencies: Array<{ id: string; version: string }>;
  nodeTypes: Array<{
    type: string;
    displayName: string;
    defaultName: string;
    fields: Array<{ key: string; defaultValue: string; control: ElementReference }>;
    view: ElementReference[];
  }>;
};

export type CollectionEdge = { id: string; sourceId: string; targetId: string };
export type NodeCollection = {
  format: "intent-node-collection";
  schemaVersion: 1;
  id: string;
  name: string;
  dependencies: Array<{ id: string; version: string }>;
  nodes: CanvasNode[];
  edges: CollectionEdge[];
};

export type ElementPluginPackage = { manifest: ElementPluginManifest; entrySource: string; files: Record<string, Uint8Array>; archive: Uint8Array };
