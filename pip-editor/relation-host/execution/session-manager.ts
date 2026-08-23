import type { JsonValue, RelationGraph, RelationPatch } from "../../relation/index.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type {
  ExecutionContextSnapshot, ExecutionNodePlan, ExecutionScopePlan,
  ExecutionSessionSnapshot, ExecutionTraceEvent, RelationNodeRuntimeResult,
} from "../contracts/package-types.ts";
import { evaluateBinding, valueKey } from "./binding.ts";
import { EffectArbiter } from "./effect-arbiter.ts";
import { ExecutionEventQueue } from "./event-queue.ts";

type Frame = { lineageId: string; sequence: number; input: JsonValue };
type InternalSession = {
  snapshot: ExecutionSessionSnapshot; graph: RelationGraph; plan: ExecutionScopePlan;
  queue: ExecutionEventQueue<Frame>; controller: AbortController; processing: boolean;
  nextSequence: number; states: Map<string, JsonValue>; effects: EffectArbiter;
};
const record = (value: JsonValue): Record<string, JsonValue> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : { value };
const copySnapshot = (session: InternalSession): ExecutionSessionSnapshot => structuredClone({ ...session.snapshot, queuedFrames: session.queue.length });

export class ExecutionSessionManager {
  readonly #registry: NodeTypePluginRegistry;
  readonly #sessions = new Map<string, InternalSession>();
  readonly #triggerSessions = new Map<string, string>();
  readonly #publish: (snapshot: ExecutionContextSnapshot) => void;

  constructor(registry: NodeTypePluginRegistry, publish: (snapshot: ExecutionContextSnapshot) => void) {
    this.#registry = registry; this.#publish = publish;
  }

  snapshot(workspaceId?: string): ExecutionContextSnapshot {
    const sessions = [...this.#sessions.values()].filter((item) => !workspaceId || item.snapshot.workspaceId === workspaceId).map(copySnapshot);
    return { sessions, activeSessionId: sessions.findLast((item) => item.status === "running" || item.status === "draining")?.id ?? sessions.at(-1)?.id };
  }

  async start(input: { workspaceId: string; graph: RelationGraph; targetNodeId: string; value?: JsonValue; continuous?: boolean; triggerNodeId?: string }) {
    const graph = structuredClone(input.graph), target = graph.nodes[input.targetNodeId];
    if (!target) throw new Error(`Execution target ${input.targetNodeId} does not exist`);
    const planner = this.#registry.executionPlanners().find((item) => item.matches(target, graph));
    if (!planner) throw new Error(`No execution planner accepts ${target.id}`);
    let value: JsonValue = input.value ?? {};
    if (input.triggerNodeId) {
      const trigger = graph.nodes[input.triggerNodeId];
      if (!trigger) throw new Error(`Trigger ${input.triggerNodeId} does not exist`);
      const provider = this.#registry.triggerProviders().find((item) => item.matches(trigger, graph));
      if (!provider) throw new Error(`No trigger provider accepts ${trigger.id}`);
      if (provider.target(trigger, graph).nodeId !== target.id) throw new Error(`Trigger ${trigger.id} does not target ${target.id}`);
      value = await provider.mapInput(trigger, value, graph);
    }
    const compiled = planner.compile(target, graph);
    if (compiled.graphRevision !== graph.revision || compiled.rootNodeId !== target.id) throw new Error("Execution planner returned a plan for a different graph or target");
    const id = crypto.randomUUID(), continuous = Boolean(input.continuous);
    const session: InternalSession = {
      graph, plan: compiled.root, queue: new ExecutionEventQueue(64), controller: new AbortController(), processing: false,
      nextSequence: 0, states: new Map(), effects: new EffectArbiter(),
      snapshot: { id, workspaceId: input.workspaceId, targetNodeId: target.id, graphRevision: graph.revision, status: "running", continuous, inputClosed: false, queuedFrames: 0, outputs: [], trace: [] },
    };
    this.#sessions.set(id, session); await this.push(id, value); if (!continuous) this.close(id); this.#drain(session); this.#emit(); return id;
  }

  async push(sessionId: string, input: JsonValue) {
    const session = this.#session(sessionId);
    if (session.snapshot.inputClosed) throw new Error("Execution input is closed");
    const frame = { lineageId: crypto.randomUUID(), sequence: session.nextSequence++, input: structuredClone(input) };
    if (session.queue.full) this.#trace(session, "backpressured", session.plan.nodeId, frame, "Ingress queue is full");
    await session.queue.push(frame, session.controller.signal); this.#trace(session, "queued", session.plan.nodeId, frame); this.#drain(session); this.#emit();
  }

  close(sessionId: string) {
    const session = this.#session(sessionId); session.snapshot.inputClosed = true;
    if (session.snapshot.status === "running") session.snapshot.status = "draining";
    this.#finishIfIdle(session); this.#emit();
  }

  cancel(sessionId: string) {
    const session = this.#session(sessionId); session.controller.abort(new Error("Execution cancelled"));
    session.snapshot.status = "cancelled"; session.snapshot.inputClosed = true; this.#emit();
  }

  async trigger(input: { workspaceId: string; graph: RelationGraph; triggerNodeId: string; payload: JsonValue }) {
    const trigger = input.graph.nodes[input.triggerNodeId], provider = trigger && this.#registry.triggerProviders().find((item) => item.matches(trigger, input.graph));
    if (!trigger || !provider) throw new Error(`No trigger provider accepts ${input.triggerNodeId}`);
    const target = provider.target(trigger, input.graph), value = await provider.mapInput(trigger, input.payload, input.graph), key = `${input.workspaceId}\u0000${trigger.id}`;
    const currentId = this.#triggerSessions.get(key), current = currentId && this.#sessions.get(currentId);
    if (current && current.snapshot.status === "running" && !current.snapshot.inputClosed) { await this.push(current.snapshot.id, value); return current.snapshot.id; }
    const id = await this.start({ workspaceId: input.workspaceId, graph: input.graph, targetNodeId: target.nodeId, value, continuous: true });
    this.#triggerSessions.set(key, id); return id;
  }

  closeTrigger(workspaceId: string, triggerNodeId: string) {
    const key = `${workspaceId}\u0000${triggerNodeId}`, id = this.#triggerSessions.get(key);
    if (id) { this.close(id); this.#triggerSessions.delete(key); }
  }

  markWorkspaceStale(workspaceId: string, revision: number) {
    for (const session of this.#sessions.values()) if (session.snapshot.workspaceId === workspaceId && session.snapshot.graphRevision !== revision && ["running", "draining"].includes(session.snapshot.status)) session.snapshot.status = "stale";
    this.#emit();
  }

  persistencePatch(sessionId: string, baseRevision: number): RelationPatch {
    const session = this.#session(sessionId), id = `relation.execution.run.${crypto.randomUUID()}`;
    return { schemaVersion: 1, baseRevision, operations: [{ op: "put-node", node: { id, relations: [
      { id: "identity", predicate: { nodeId: "relation.core.identity", relationId: "identity" }, object: { kind: "const", value: id }, relations: [] },
      { id: "type", predicate: { nodeId: "relation.core.type", relationId: "identity" }, object: { kind: "ref", target: { nodeId: "relation.execution.type.run", relationId: "identity" } }, relations: [] },
      { id: "target", predicate: { nodeId: "relation.execution.predicate.target", relationId: "identity" }, object: { kind: "ref", target: { nodeId: session.snapshot.targetNodeId, relationId: "identity" } }, relations: [] },
      { id: "status", predicate: { nodeId: "relation.execution.predicate.status", relationId: "identity" }, object: { kind: "const", value: session.snapshot.status }, relations: [] },
      { id: "graph-revision", predicate: { nodeId: "relation.execution.predicate.graph-revision", relationId: "identity" }, object: { kind: "const", value: session.snapshot.graphRevision }, relations: [] },
      { id: "outputs", predicate: { nodeId: "relation.execution.predicate.outputs", relationId: "identity" }, object: { kind: "const", value: session.snapshot.outputs }, relations: [] },
      { id: "trace", predicate: { nodeId: "relation.execution.predicate.trace", relationId: "identity" }, object: { kind: "const", value: session.snapshot.trace }, relations: [] },
    ] } }] };
  }

  async #drain(session: InternalSession) {
    if (session.processing) return; session.processing = true;
    try {
      while (!session.controller.signal.aborted) {
        const frame = session.queue.shift(); if (!frame) break;
        session.snapshot.activeLineageId = frame.lineageId;
        try {
          const output = await this.#executeScope(session, session.plan, record(frame.input), frame, 0);
          session.snapshot.outputs.push({ lineageId: frame.lineageId, value: output }); this.#trace(session, "output", session.plan.nodeId, frame);
        } catch (error) {
          this.#trace(session, "failed", session.plan.nodeId, frame, error instanceof Error ? error.message : "Execution failed");
          session.snapshot.error = error instanceof Error ? error.message : "Execution failed";
          if (!session.snapshot.continuous) session.snapshot.status = "failed";
        }
      }
    } finally { session.processing = false; session.snapshot.activeLineageId = undefined; this.#finishIfIdle(session); this.#emit(); }
  }

  async #executeScope(session: InternalSession, scope: ExecutionScopePlan, environment: Record<string, JsonValue>, frame: Frame, generation: number, delayed = new Map<string, JsonValue>()): Promise<Record<string, JsonValue>> {
    if (generation > 1024) throw new Error("Execution exceeded 1024 delay generations");
    const values = new Map<string, JsonValue>();
    for (const port of scope.inputs) if (port.id in environment) values.set(valueKey(scope.nodeId, port.id), environment[port.id]);
    const ranks = [...new Set(scope.nodes.map((node) => node.rank))].sort((a, b) => a - b);
    for (const rank of ranks) {
      const nodes = scope.nodes.filter((node) => node.rank === rank).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
      const settled = await Promise.allSettled(nodes.map((node) => this.#executeNode(session, node, values, frame, generation, delayed)));
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") for (const [portId, value] of Object.entries(result.value)) values.set(valueKey(nodes[index].nodeId, portId), value);
      });
    }
    const output: Record<string, JsonValue> = {};
    for (const port of scope.outputs) {
      const value = await evaluateBinding(port.binding, values, this.#registry.relationOperators());
      if (value !== undefined) output[port.id] = value;
      else if (port.required) throw new Error(`Required output ${scope.nodeId}/${port.id} was not produced`);
    }
    const nextDelayed = new Map<string, JsonValue>();
    for (const node of scope.nodes) for (const port of node.inputs.filter((item) => item.delayBoundary)) {
      const value = await evaluateBinding(port.binding, values, this.#registry.relationOperators());
      nextDelayed.set(valueKey(node.nodeId, port.id), value ?? null);
    }
    const changed = nextDelayed.size > 0 && [...nextDelayed].some(([key, value]) => JSON.stringify(delayed.get(key)) !== JSON.stringify(value));
    return changed ? this.#executeScope(session, scope, environment, frame, generation + 1, nextDelayed) : output;
  }

  async #executeNode(session: InternalSession, plan: ExecutionNodePlan, values: Map<string, JsonValue>, frame: Frame, generation: number, delayed: Map<string, JsonValue>) {
    const inputs: Record<string, JsonValue> = {};
    for (const port of plan.inputs) {
      const value = port.delayBoundary ? delayed.get(valueKey(plan.nodeId, port.id)) ?? null : await evaluateBinding(port.binding, values, this.#registry.relationOperators());
      if (value !== undefined) inputs[port.id] = value;
      else if (port.required) { this.#trace(session, "failed", plan.nodeId, frame, `Required input ${port.id} is unavailable`, generation); return {}; }
    }
    this.#trace(session, "running", plan.nodeId, frame, undefined, generation);
    try {
      const result: RelationNodeRuntimeResult = plan.scope
        ? { outputs: await this.#executeScope(session, plan.scope, inputs, frame, generation) }
        : await this.#runtime(session, plan.nodeId, inputs);
      if (result.state !== undefined) session.states.set(plan.nodeId, structuredClone(result.state));
      for (const [index, effect] of (result.effects ?? []).entries()) {
        const key = `${session.snapshot.id}:${frame.lineageId}:${generation}:${plan.nodeId}:${index}`;
        await session.effects.execute(effect, key, this.#registry.effectHandlers(), session.controller.signal);
        this.#trace(session, "effect", plan.nodeId, frame, effect.type, generation);
      }
      this.#trace(session, "success", plan.nodeId, frame, undefined, generation); return result.outputs;
    } catch (error) { this.#trace(session, "failed", plan.nodeId, frame, error instanceof Error ? error.message : "Node failed", generation); throw error; }
  }

  async #runtime(session: InternalSession, nodeId: string, inputs: Record<string, JsonValue>) {
    const node = session.graph.nodes[nodeId], runtime = this.#registry.nodeRuntimes().find((item) => item.matches(node, session.graph));
    if (!runtime) throw new Error(`No node runtime accepts ${nodeId}`);
    return runtime.execute({ node, graph: session.graph, inputs, state: session.states.get(nodeId), signal: session.controller.signal });
  }

  #trace(session: InternalSession, kind: ExecutionTraceEvent["kind"], nodeId: string, frame: Frame, message?: string, generation = 0) {
    session.snapshot.trace.push({ index: session.snapshot.trace.length, at: Date.now(), kind, nodeId, lineageId: frame.lineageId, generation, ...(message ? { message } : {}) });
  }
  #finishIfIdle(session: InternalSession) { if (!session.processing && !session.queue.length && session.snapshot.inputClosed && !["cancelled", "failed", "stale"].includes(session.snapshot.status)) session.snapshot.status = "completed"; }
  #session(id: string) { const session = this.#sessions.get(id); if (!session) throw new Error(`Unknown execution session ${id}`); return session; }
  #emit() { this.#publish(this.snapshot()); }
}
