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
  projectionDefaults?: { selfWorkspace?: string; selfEmbedded: string; childrenWorkspace: string };
};
/** Projection contexts are a closed union: a children projection is never embedded. */
export type ProjectionContext =
  | { kind: "self-workspace" }
  | { kind: "children-workspace" }
  | { kind: "self-embedded"; parentProjectionNodeId: string; frame: WorkspaceWindowFrame };
export type ProjectionContextKind = ProjectionContext["kind"];
export type ProjectionRouteEntry = {
  projectionNodeId: string; observedNodeId: string; context: "self-workspace" | "children-workspace";
  enteredFrom?: { parentInternalProjectionId: string; childProjectionId: string };
};
export type ProjectionNavigationState = {
  entries: ProjectionRouteEntry[]; index: number; semanticScale: number;
  semanticOrigin?: WorkspacePoint; semanticTargetProjectionId?: string;
};
export type ElementContext = {
  workspaceId: string; rootNodeIds: string[]; workspaceView: JsonValue; graph: RelationGraph;
  node?: RelationNode; relation?: Relation; typeDescriptor?: ResolvedNodeType; selection: string[];
  projection?: { id: string; data: JsonValue };
  projectionNode?: RelationNode; observedNode?: RelationNode; projectionContext?: ProjectionContext;
  execution?: ExecutionContextSnapshot;
};
export type RelationElementRequest =
  | { kind: "apply-patch"; patch: RelationPatch }
  | { kind: "select"; nodeIds: string[]; scopeId?: string }
  | { kind: "command"; commandId: string; input: JsonValue }
  | { kind: "invoke-creator"; creatorId: string; worldPosition: WorkspacePoint; origin?: RelationRef; input?: JsonValue }
  | { kind: "navigate-projection"; projectionNodeId: string }
  | { kind: "close-workspace-root"; nodeId: string }
  | { kind: "set-workspace-window"; windowId: string; frame: WorkspaceWindowFrame }
  | { kind: "set-execution-view"; windowId: string; state: ProjectionExecutionViewState }
  | { kind: "start-execution"; targetNodeId: string; triggerNodeId?: string; input?: JsonValue; continuous?: boolean }
  | { kind: "push-execution-frame"; sessionId: string; input: JsonValue }
  | { kind: "close-execution-input"; sessionId: string }
  | { kind: "cancel-execution"; sessionId: string }
  | { kind: "persist-execution-result"; sessionId: string };

export type NodeTypePluginManifest = Extract<PipManifest, { layer: "a4" }>;
export type NodeTypePluginPackage = { manifest: NodeTypePluginManifest; ontology: RelationGraph; entrySource: string; files: Record<string, Uint8Array>; pipBytes: Uint8Array; contentSha256: string };

export type Disposable = { dispose(): void } | (() => void);
export type RelationValidator = (graph: RelationGraph) => void;
export type RelationCommandHandler = (input: JsonValue, graph: RelationGraph) => RelationPatch | Promise<RelationPatch>;
export type RelationExecutor = (node: RelationNode, graph: RelationGraph) => JsonValue | Promise<JsonValue>;
export type ExecutionBinding = { target?: RelationRef; value?: JsonValue; op?: string; args?: ExecutionBinding[] };
export type ExecutionPortPlan = { id: string; required: boolean; queueCapacity: number; binding?: ExecutionBinding; delayBoundary?: boolean };
export type ExecutionNodePlan = {
  nodeId: string; rank: number; inputs: ExecutionPortPlan[]; outputs: ExecutionPortPlan[];
  scope?: ExecutionScopePlan;
};
export type ExecutionScopePlan = {
  nodeId: string; inputs: ExecutionPortPlan[]; outputs: ExecutionPortPlan[]; nodes: ExecutionNodePlan[];
};
export type RelationExecutionPlan = { plannerId: string; rootNodeId: string; graphRevision: number; root: ExecutionScopePlan };
export type RelationExecutionPlanner = {
  id: string;
  matches(node: RelationNode, graph: RelationGraph): boolean;
  compile(node: RelationNode, graph: RelationGraph): RelationExecutionPlan;
};
export type RelationEffect = { type: string; input: JsonValue };
export type RelationNodeRuntimeResult = { outputs: Record<string, JsonValue>; state?: JsonValue; effects?: RelationEffect[] };
export type RelationNodeRuntime = {
  id: string;
  matches(node: RelationNode, graph: RelationGraph): boolean;
  execute(input: { node: RelationNode; graph: RelationGraph; inputs: Record<string, JsonValue>; state?: JsonValue; signal: AbortSignal }): RelationNodeRuntimeResult | Promise<RelationNodeRuntimeResult>;
};
export type RelationOperator = { id: string; evaluate(args: JsonValue[]): JsonValue | Promise<JsonValue> };
export type RelationTriggerProvider = {
  id: string;
  matches(trigger: RelationNode, graph: RelationGraph): boolean;
  target(trigger: RelationNode, graph: RelationGraph): RelationRef;
  mapInput(trigger: RelationNode, payload: JsonValue, graph: RelationGraph): JsonValue | Promise<JsonValue>;
  activation?(trigger: RelationNode, graph: RelationGraph):
    | { kind: "hook"; key: string }
    | { kind: "schedule" | "poll"; intervalMs: number; payload?: JsonValue }
    | undefined;
};
export type RelationEffectHandler = {
  type: string;
  execute(effect: RelationEffect, context: { idempotencyKey: string; signal: AbortSignal }): JsonValue | Promise<JsonValue>;
};
export type ExecutionTraceEvent = {
  index: number; at: number; kind: "queued" | "running" | "success" | "failed" | "backpressured" | "effect" | "output";
  nodeId: string; lineageId: string; generation: number; message?: string;
};
export type ExecutionSessionSnapshot = {
  id: string; workspaceId: string; targetNodeId: string; graphRevision: number;
  status: "running" | "draining" | "completed" | "cancelled" | "failed" | "stale";
  continuous: boolean; inputClosed: boolean; queuedFrames: number; activeLineageId?: string;
  outputs: Array<{ lineageId: string; value: JsonValue }>; trace: ExecutionTraceEvent[]; error?: string;
};
export type ExecutionContextSnapshot = { sessions: ExecutionSessionSnapshot[]; activeSessionId?: string };
export type WorkspacePoint = { x: number; y: number };
export type WorkspaceWindowFrame = WorkspacePoint & {
  width: number; height: number; resizeMode: "simple" | "full"; contentScale?: number;
  contentOffset?: WorkspacePoint;
  navigation?: ProjectionNavigationState;
  execution?: ProjectionExecutionViewState;
};
export type ProjectionExecutionViewState = {
  sessionId?: string; lineageId?: string; generation?: number; traceCursor?: number;
  flowLayerVisible: boolean; followActiveEvent: boolean;
};
export type RelationCreationContext = {
  workspaceId: string; graph: RelationGraph; rootNodeIds: string[];
  worldPosition: WorkspacePoint; origin?: RelationRef;
};
export type RelationCreationResult = {
  patch?: RelationPatch; addRootNodeIds?: string[];
  preferredProjection?: { projectionId: string; width: number; height: number };
};
export type RelationCreator = {
  id: string; label: string; description?: string; category: string; icon?: string;
  accepts(context: RelationCreationContext): boolean;
  create(context: RelationCreationContext, input?: JsonValue): RelationCreationResult | Promise<RelationCreationResult>;
};
export type RelationProjection = {
  id: string; name?: string; icon?: string; purpose?: "node" | "workspace"; definition?: RelationRef; contexts?: ProjectionContextKind[];
  matches(node: RelationNode, graph: RelationGraph): boolean;
  project?(input: {
    workspaceId: string; rootNodeIds: string[]; workspaceView: JsonValue; graph: RelationGraph;
    node: RelationNode; projectionNode: RelationNode; observedNode: RelationNode;
    context: ProjectionContext; selection: string[];
  }): JsonValue;
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
  registerExecutionPlanner(planner: RelationExecutionPlanner): Disposable;
  registerNodeRuntime(runtime: RelationNodeRuntime): Disposable;
  registerRelationOperator(operator: RelationOperator): Disposable;
  registerTriggerProvider(provider: RelationTriggerProvider): Disposable;
  registerEffectHandler(handler: RelationEffectHandler): Disposable;
};

export type NodeMapManifest = Extract<PipManifest, { layer: "a5" }>;
export type NodeMapWorkspace = { views: JsonValue; initialSelection?: string[] };
export type NodeMap = { manifest: NodeMapManifest; graph: RelationGraph; workspace: NodeMapWorkspace };
export type ExactPackageRef = PipPackageRef;
