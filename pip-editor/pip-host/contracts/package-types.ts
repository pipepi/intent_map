/** Defines the requests and capabilities that cross the host/plugin boundary. */
import type { JsonValue, Pip, PipTx, PipRef } from "../../pip/index.ts";
import type { PipManifest, PipPackageRef } from "../../pip-package/index.ts";

export type PluginInstallStatus = "installed" | "already-active" | "reactivated";
export type ElementPurpose = "control" | "preview" | "node" | "projection" | "panel" | "creator" | "workspace-window";
export type ElementDeclaration = { id: string; tag: string; purpose: ElementPurpose };
export type ElementPluginManifest = Extract<PipManifest, { layer: "a3" }>;
export type ElementPluginPackage = { manifest: ElementPluginManifest; entrySource: string; files: Record<string, Uint8Array>; pipBytes: Uint8Array; contentSha256: string };

export type ResolvedNodeType = {
  type: PipRef; name: string; element?: { pluginId: string; elementId: string };
  matches?: (node: Pip, graph: Pip) => boolean;
  label?: (node: Pip, graph: Pip) => string;
  projectionDefaults?: { selfWorkspace?: string; selfEmbedded: string; childrenWorkspace: string };
};
export type ObservationScope = "self" | "children";
export type ProjectionSurface = "workspace" | "embedded";
/** Legacy combined capability retained while A3/A4 packages migrate to scope + surface. */
export type ProjectionContextKind = "self-workspace" | "children-workspace" | "self-embedded";
/** Runtime contexts expose the orthogonal model and a derived legacy kind for old plugins. */
export type ProjectionContext =
  | { scope: "self"; surface: "workspace"; kind: "self-workspace" }
  | { scope: "children"; surface: "workspace"; kind: "children-workspace" }
  | { scope: "self"; surface: "embedded"; kind: "self-embedded"; parentProjectionNodeId: string; frame: WorkspaceWindowFrame };
export type ProjectionContextInput = ProjectionContext
  | { kind: "self-workspace" }
  | { kind: "children-workspace" }
  | { kind: "self-embedded"; parentProjectionNodeId: string; frame: WorkspaceWindowFrame };
export type ProjectionRouteEntry = {
  projectionNodeId: string; observedNodeId: string; scope: ObservationScope;
  enteredFrom?: { parentInternalProjectionId: string; childProjectionId: string };
};
export type ProjectionNavigationState = {
  entries: ProjectionRouteEntry[]; index: number; semanticScale: number;
  semanticOrigin?: WorkspacePoint; semanticTargetProjectionId?: string;
};
export type ElementContext = {
  workspaceId: string; rootNodeIds: string[]; workspaceView: JsonValue; graph: Pip;
  node?: Pip; pip?: Pip; typeDescriptor?: ResolvedNodeType; selection: string[];
  projection?: { id: string; data: JsonValue };
  projectionNode?: Pip; observedNode?: Pip; projectionContext?: ProjectionContext;
  execution?: ExecutionContextSnapshot;
};
export type PipElementRequest =
  | { kind: "apply-patch"; patch: PipTx }
  | { kind: "select"; nodeIds: string[]; scopeId?: string }
  | { kind: "command"; commandId: string; input: JsonValue }
  | { kind: "invoke-creator"; creatorId: string; worldPosition: WorkspacePoint; origin?: PipRef; input?: JsonValue }
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
export type NodeTypePluginPackage = { manifest: NodeTypePluginManifest; ontology: Pip; entrySource: string; files: Record<string, Uint8Array>; pipBytes: Uint8Array; contentSha256: string; embeddedElements: ElementPluginPackage[] };

export type Disposable = { dispose(): void } | (() => void);
export type PipValidator = (graph: Pip) => void;
export type PipCommandHandler = (input: JsonValue, graph: Pip) => PipTx | Promise<PipTx>;
export type PipExecutor = (node: Pip, graph: Pip) => JsonValue | Promise<JsonValue>;
export type ExecutionBinding = { target?: PipRef; value?: JsonValue; op?: string; args?: ExecutionBinding[] };
export type ExecutionPortPlan = { id: string; required: boolean; queueCapacity: number; binding?: ExecutionBinding; delayBoundary?: boolean };
export type ExecutionNodePlan = {
  nodeId: string; rank: number; inputs: ExecutionPortPlan[]; outputs: ExecutionPortPlan[];
  scope?: ExecutionScopePlan;
};
export type ExecutionScopePlan = {
  nodeId: string; inputs: ExecutionPortPlan[]; outputs: ExecutionPortPlan[]; nodes: ExecutionNodePlan[];
};
export type PipExecutionPlan = { plannerId: string; rootNodeId: string; graphRevision: number; root: ExecutionScopePlan };
export type PipExecutionPlanner = {
  id: string;
  matches(node: Pip, graph: Pip): boolean;
  compile(node: Pip, graph: Pip): PipExecutionPlan;
};
export type PipEffect = { type: string; input: JsonValue };
export type PipNodeRuntimeResult = { outputs: Record<string, JsonValue>; state?: JsonValue; effects?: PipEffect[] };
export type PipNodeRuntime = {
  id: string;
  matches(node: Pip, graph: Pip): boolean;
  execute(input: { node: Pip; graph: Pip; inputs: Record<string, JsonValue>; state?: JsonValue; signal: AbortSignal }): PipNodeRuntimeResult | Promise<PipNodeRuntimeResult>;
};
export type PipOperator = { id: string; evaluate(args: JsonValue[]): JsonValue | Promise<JsonValue> };
export type PipTriggerProvider = {
  id: string;
  matches(trigger: Pip, graph: Pip): boolean;
  target(trigger: Pip, graph: Pip): PipRef;
  mapInput(trigger: Pip, payload: JsonValue, graph: Pip): JsonValue | Promise<JsonValue>;
  activation?(trigger: Pip, graph: Pip):
    | { kind: "hook"; key: string }
    | { kind: "schedule" | "poll"; intervalMs: number; payload?: JsonValue }
    | undefined;
};
export type PipEffectHandler = {
  type: string;
  execute(effect: PipEffect, context: { idempotencyKey: string; signal: AbortSignal }): JsonValue | Promise<JsonValue>;
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
export type PipCreationContext = {
  workspaceId: string; graph: Pip; rootNodeIds: string[];
  worldPosition: WorkspacePoint; origin?: PipRef;
};
export type PipCreationResult = {
  patch?: PipTx; addRootNodeIds?: string[];
  preferredProjection?: { projectionId: string; width: number; height: number };
};
export type PipCreator = {
  id: string; label: string; description?: string; category: string; icon?: string;
  accepts(context: PipCreationContext): boolean;
  create(context: PipCreationContext, input?: JsonValue): PipCreationResult | Promise<PipCreationResult>;
};
export type PipProjection = {
  id: string; name?: string; icon?: string; purpose?: "node" | "workspace"; definition?: PipRef;
  scope?: ObservationScope; surfaces?: ProjectionSurface[];
  /** @deprecated Use scope and surfaces. */
  contexts?: ProjectionContextKind[];
  windowChrome?: "host" | "plugin";
  /** A3 visual boundary, relayed by A4 so A2 clips semantic transitions to scalable content. */
  zoomViewport?: { top: number; right: number; bottom: number; left: number };
  matches(node: Pip, graph: Pip): boolean;
  project?(input: {
    workspaceId: string; rootNodeIds: string[]; workspaceView: JsonValue; graph: Pip;
    node: Pip; projectionNode: Pip; observedNode: Pip;
    context: ProjectionContext; selection: string[];
  }): JsonValue;
  element: { pluginId: string; elementId: string };
};
export type PipParseCandidate = { id: string; label: string; confidence: number; diagnostics: string[]; patch: PipTx };
export type PipLanguageProvider = {
  id: string;
  parse(input: { text: string; locale: string; graph: Pip; contextNodeId?: string }): Promise<PipParseCandidate[]>;
  describe(input: { nodeId: string; locale: string; graph: Pip }): Promise<string>;
};
export type NodeTypePluginHost = {
  registerType(descriptor: ResolvedNodeType): Disposable;
  registerValidator(validator: PipValidator): Disposable;
  registerCommand(id: string, command: PipCommandHandler): Disposable;
  registerExecutor(id: string, executor: PipExecutor): Disposable;
  registerProjection(projection: PipProjection): Disposable;
  registerCreator(creator: PipCreator): Disposable;
  registerLanguageProvider(provider: PipLanguageProvider): Disposable;
  registerExecutionPlanner(planner: PipExecutionPlanner): Disposable;
  registerNodeRuntime(runtime: PipNodeRuntime): Disposable;
  registerPipOperator(operator: PipOperator): Disposable;
  registerTriggerProvider(provider: PipTriggerProvider): Disposable;
  registerEffectHandler(handler: PipEffectHandler): Disposable;
};

export type NodeMapManifest = Extract<PipManifest, { layer: "a5" }>;
export type NodeMapWorkspace = { views: JsonValue; initialSelection?: string[] };
export type NodeMap = { manifest: NodeMapManifest; graph: Pip; workspace: NodeMapWorkspace };
export type ExactPackageRef = PipPackageRef;
