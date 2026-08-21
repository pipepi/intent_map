import type { JsonValue, Relation, RelationGraph, RelationNode, RelationPatch, RelationRef } from "../../relation/model";

export type ExactPackageRef = { id: string; version: string };
export type PluginInstallStatus = "installed" | "already-active" | "reactivated";
export type ElementPurpose = "control" | "preview" | "node" | "projection" | "panel";
export type ElementDeclaration = { id: string; tag: string; purpose: ElementPurpose };
export type ElementPluginManifest = {
  format: "intent-element-plugin"; schemaVersion: 2; runtimeAbi: "relation-element/2";
  id: string; name: string; version: string; entry: "entry.mjs"; elements: ElementDeclaration[];
  permissions: string[]; sourcePaths: string[]; sourceSha256: string; entrySha256: string;
  communityTags: string[]; redistributable: boolean;
};
export type ElementPluginPackage = { manifest: ElementPluginManifest; entrySource: string; files: Record<string, Uint8Array>; archive: Uint8Array };

export type ResolvedNodeType = {
  type: RelationRef; name: string; element?: { pluginId: string; elementId: string };
  matches?: (node: RelationNode, graph: RelationGraph) => boolean;
};
export type ElementContext = {
  workspaceId: string; rootNodeIds: string[]; workspaceView: JsonValue; graph: RelationGraph;
  node?: RelationNode; relation?: Relation; typeDescriptor?: ResolvedNodeType; selection: string[];
  projection?: { id: string; data: JsonValue };
};
export type RelationElementRequest =
  | { kind: "apply-patch"; patch: RelationPatch }
  | { kind: "select"; nodeIds: string[] }
  | { kind: "command"; commandId: string; input: JsonValue };

export type NodeTypePluginManifest = {
  format: "intent-node-type-plugin"; schemaVersion: 2; runtimeAbi: "relation-node-type/2";
  id: string; name: string; version: string; entry: "entry.mjs"; ontology: "ontology.json";
  elementDependencies: ExactPackageRef[]; permissions: string[]; typeNodeIds: string[];
  sourcePaths: string[]; sourceSha256: string; entrySha256: string; redistributable: boolean;
};
export type NodeTypePluginPackage = { manifest: NodeTypePluginManifest; ontology: RelationGraph; entrySource: string; files: Record<string, Uint8Array>; archive: Uint8Array };

export type Disposable = { dispose(): void } | (() => void);
export type RelationValidator = (graph: RelationGraph) => void;
export type RelationCommandHandler = (input: JsonValue, graph: RelationGraph) => RelationPatch | Promise<RelationPatch>;
export type RelationExecutor = (node: RelationNode, graph: RelationGraph) => JsonValue | Promise<JsonValue>;
export type RelationProjection = {
  id: string; purpose: "node" | "workspace";
  matches(node: RelationNode, graph: RelationGraph): boolean;
  project?(input: { workspaceId: string; rootNodeIds: string[]; graph: RelationGraph; node: RelationNode }): JsonValue;
  element: { pluginId: string; elementId: string };
};
export type RelationParseCandidate = { id: string; label: string; confidence: number; diagnostics: string[]; patch: RelationPatch };
export type RelationLanguageProvider = {
  id: string;
  parse(input: { text: string; locale: string; graph: RelationGraph; contextNodeId?: string }): Promise<RelationParseCandidate[]>;
  describe(input: { nodeId: string; locale: string; graph: RelationGraph }): Promise<string>;
};
export type NodeTypePluginHost = {
  registerType(descriptor: ResolvedNodeType): Disposable;
  registerValidator(validator: RelationValidator): Disposable;
  registerCommand(id: string, command: RelationCommandHandler): Disposable;
  registerExecutor(id: string, executor: RelationExecutor): Disposable;
  registerProjection(projection: RelationProjection): Disposable;
  registerLanguageProvider(provider: RelationLanguageProvider): Disposable;
};

export type NodeCollectionManifest = {
  format: "intent-node-collection"; schemaVersion: 2; id: string; name: string; version: string; rootNodeIds: string[];
  dependencies: { nodeTypes: ExactPackageRef[]; elements: ExactPackageRef[] };
};
export type NodeCollectionWorkspace = { views: JsonValue; initialSelection?: string[] };
export type NodeCollectionPlugin = { manifest: NodeCollectionManifest; graph: RelationGraph; workspace: NodeCollectionWorkspace };
