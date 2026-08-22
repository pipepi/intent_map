/** Defines the requests and capabilities that cross the host/plugin boundary. */
import type { JsonValue, Relation, RelationGraph, RelationNode, RelationPatch, RelationRef } from "../../relation/index.ts";
import type { PipManifest, PipPackageRef } from "../../pip/index.ts";

export type PluginInstallStatus = "installed" | "already-active" | "reactivated";
export type ElementPurpose = "control" | "preview" | "node" | "projection" | "panel" | "creator" | "workspace-window";
export type ElementDeclaration = { id: string; tag: string; purpose: ElementPurpose };
export type ElementPluginManifest = Extract<PipManifest, { layer: "a3" }>;
export type ElementPluginPackage = { manifest: ElementPluginManifest; entrySource: string; files: Record<string, Uint8Array>; pipBytes: Uint8Array; contentSha256: string };

export type ResolvedNodeType = {
  type: RelationRef; name: string; element?: { pluginId: string; elementId: string };
  matches?: (node: RelationNode, graph: RelationGraph) => boolean;
  label?: (node: RelationNode, graph: RelationGraph) => string;
};
export type ElementContext = {
  workspaceId: string; rootNodeIds: string[]; workspaceView: JsonValue; graph: RelationGraph;
  node?: RelationNode; relation?: Relation; typeDescriptor?: ResolvedNodeType; selection: string[];
  projection?: { id: string; data: JsonValue };
};
export type RelationElementRequest =
  | { kind: "apply-patch"; patch: RelationPatch }
  | { kind: "select"; nodeIds: string[]; scopeId?: string }
  | { kind: "command"; commandId: string; input: JsonValue }
  | { kind: "invoke-creator"; creatorId: string; worldPosition: WorkspacePoint; origin?: RelationRef; input?: JsonValue }
  | { kind: "set-workspace-window"; windowId: string; frame: WorkspaceWindowFrame };

export type NodeTypePluginManifest = Extract<PipManifest, { layer: "a4" }>;
export type NodeTypePluginPackage = { manifest: NodeTypePluginManifest; ontology: RelationGraph; entrySource: string; files: Record<string, Uint8Array>; pipBytes: Uint8Array; contentSha256: string };

export type Disposable = { dispose(): void } | (() => void);
export type RelationValidator = (graph: RelationGraph) => void;
export type RelationCommandHandler = (input: JsonValue, graph: RelationGraph) => RelationPatch | Promise<RelationPatch>;
export type RelationExecutor = (node: RelationNode, graph: RelationGraph) => JsonValue | Promise<JsonValue>;
export type WorkspacePoint = { x: number; y: number };
export type WorkspaceWindowFrame = WorkspacePoint & {
  width: number; height: number; resizeMode: "simple" | "full"; contentScale?: number;
};
export type RelationCreationContext = {
  workspaceId: string; graph: RelationGraph; rootNodeIds: string[];
  worldPosition: WorkspacePoint; origin?: RelationRef;
};
export type RelationCreationResult = {
  patch: RelationPatch; addRootNodeIds?: string[];
  preferredProjection?: { projectionId: string; width: number; height: number };
};
export type RelationCreator = {
  id: string; label: string; description?: string; category: string; icon?: string;
  accepts(context: RelationCreationContext): boolean;
  create(context: RelationCreationContext, input?: JsonValue): RelationCreationResult | Promise<RelationCreationResult>;
};
export type RelationProjection = {
  id: string; purpose: "node" | "workspace";
  matches(node: RelationNode, graph: RelationGraph): boolean;
  project?(input: { workspaceId: string; rootNodeIds: string[]; workspaceView: JsonValue; graph: RelationGraph; node: RelationNode; selection: string[] }): JsonValue;
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
  registerCreator(creator: RelationCreator): Disposable;
  registerLanguageProvider(provider: RelationLanguageProvider): Disposable;
};

export type NodeMapManifest = Extract<PipManifest, { layer: "a5" }>;
export type NodeMapWorkspace = { views: JsonValue; initialSelection?: string[] };
export type NodeMap = { manifest: NodeMapManifest; graph: RelationGraph; workspace: NodeMapWorkspace };
export type ExactPackageRef = PipPackageRef;
