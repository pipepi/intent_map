import type { JsonValue } from "./model";

export type RuntimeEvent = {
  id: string;
  type: string;
  source: string;
  payload?: Record<string, JsonValue>;
  createdAt: number;
};

export type RuntimeCommand = {
  id: string;
  type: string;
  sourceEventId: string;
  payload?: Record<string, JsonValue>;
};

export type ApplicationRuntimeState = {
  scopeId: string;
  selectionId: string;
  layoutLocked: boolean;
  documentRevision: number;
  lastEventType: string;
};

export type PipelineTraceEntry = {
  tick: number;
  sequence: number;
  eventId: string;
  eventType: string;
  source: string;
  outcome: "state" | "command" | "ignored";
};

export type PipelineBatchResult = {
  state: ApplicationRuntimeState;
  commands: RuntimeCommand[];
  nextTick: RuntimeEvent[];
  trace: PipelineTraceEntry[];
};

export const MAX_EVENTS_PER_TICK = 512;

const commandTypes: Record<string, string> = {
  NEW_DOCUMENT: "NEW_DOCUMENT",
  IMPORT_REQUEST: "IMPORT_REQUEST",
  EXPORT_V2: "EXPORT_V2",
  EXPORT_V1: "EXPORT_V1",
  UNDO: "UNDO",
  REDO: "REDO",
  AUTO_LAYOUT: "AUTO_LAYOUT",
  PUBLISH_MODULE: "PUBLISH_MODULE",
  RUN_REQUEST: "RUN_BUSINESS",
  STOP_REQUEST: "STOP_BUSINESS",
  ADD_BUSINESS_CHILD: "ADD_BUSINESS_CHILD",
  DUPLICATE_NODE: "DUPLICATE_NODE",
  DELETE_NODE: "DELETE_NODE",
  DUPLICATE_APP_NODE: "DUPLICATE_APP_NODE",
  DELETE_APP_NODE: "DELETE_APP_NODE",
  RESET_APP_GRAPH: "RESET_APP_GRAPH",
};

const commandFor = (
  event: RuntimeEvent,
  sequence: number,
): RuntimeCommand | undefined => {
  const type = commandTypes[event.type];
  if (!type) return undefined;
  return {
    id: `command:${event.id}:${sequence}`,
    type,
    sourceEventId: event.id,
    payload: event.payload,
  };
};

export const processEventBatch = (
  events: RuntimeEvent[],
  currentState: ApplicationRuntimeState,
  tick: number,
  maxEvents = MAX_EVENTS_PER_TICK,
): PipelineBatchResult => {
  if (events.length > maxEvents) {
    throw new Error(
      `事件时钟 tick ${tick} 超出安全上限：${events.length}/${maxEvents}`,
    );
  }
  const state = { ...currentState };
  const commands: RuntimeCommand[] = [];
  const nextTick: RuntimeEvent[] = [];
  const trace: PipelineTraceEntry[] = [];
  const seen = new Set<string>();

  events.forEach((event, sequence) => {
    if (seen.has(event.id)) {
      trace.push({
        tick,
        sequence,
        eventId: event.id,
        eventType: event.type,
        source: event.source,
        outcome: "ignored",
      });
      return;
    }
    seen.add(event.id);
    let outcome: PipelineTraceEntry["outcome"] = "state";
    if (event.type === "SELECT_NODE") {
      state.selectionId =
        typeof event.payload?.nodeId === "string"
          ? event.payload.nodeId
          : state.selectionId;
    } else if (event.type === "NAVIGATE_SCOPE") {
      state.scopeId =
        typeof event.payload?.scopeId === "string"
          ? event.payload.scopeId
          : state.scopeId;
    } else if (event.type === "SET_LAYOUT_LOCK") {
      state.layoutLocked = Boolean(event.payload?.locked);
    } else if (event.type === "DOCUMENT_CHANGED") {
      state.documentRevision += 1;
      nextTick.push({
        id: `derived:${event.id}:state-changed`,
        type: "STATE_CHANGED",
        source: "app_state",
        payload: { revision: state.documentRevision },
        createdAt: event.createdAt,
      });
    } else if (event.type === "DOCUMENT_LOADED") {
      state.scopeId =
        typeof event.payload?.scopeId === "string"
          ? event.payload.scopeId
          : state.scopeId;
      state.selectionId =
        typeof event.payload?.selectionId === "string"
          ? event.payload.selectionId
          : state.selectionId;
      state.documentRevision += 1;
    } else {
      const command = commandFor(event, sequence);
      if (command) {
        commands.push(command);
        outcome = "command";
      } else {
        outcome = "ignored";
      }
    }
    state.lastEventType = event.type;
    trace.push({
      tick,
      sequence,
      eventId: event.id,
      eventType: event.type,
      source: event.source,
      outcome,
    });
  });

  return { state, commands, nextTick, trace };
};

export const createRuntimeEvent = (
  type: string,
  source: string,
  payload?: Record<string, JsonValue>,
): RuntimeEvent => ({
  id: `event:${type}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`,
  type,
  source,
  payload,
  createdAt: Date.now(),
});
