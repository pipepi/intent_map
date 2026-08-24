import { initialState, stateRelation } from "./state.js";

const ref = (id, predicate, target) => ({ id, predicate: { nodeId: predicate, relationId: "identity" }, object: { kind: "ref", target: { nodeId: target, relationId: "identity" } }, relations: [] });
const constant = (id, predicate, value) => ({ id, predicate: { nodeId: predicate, relationId: "identity" }, object: { kind: "const", value }, relations: [] });

export const terminalCreator = {
  id: "spot.terminal.create", label: "现货交易终端", description: "打开连接本地 AEX Spot 服务的专业交易终端", category: "交易", icon: "↗",
  // Each terminal owns an isolated in-memory auth session, so one workspace may host multiple accounts.
  accepts() { return true; },
  create({ graph }) {
    const suffix = globalThis.crypto?.randomUUID?.() ?? Date.now(), terminalId = `spot.terminal:${suffix}`, projectionId = `spot.terminal.view:${suffix}`;
    const ensureIdentity = (id) => graph.nodes[id] ? [] : [{ op: "put-node", node: {
      id, relations: [constant("identity", "relation.core.identity", id)],
    } }];
    return {
      patch: { schemaVersion: 1, baseRevision: graph.revision, operations: [
        // Plugin registrations describe behavior, but graph references still require concrete identity nodes.
        ...ensureIdentity("spot.terminal.type.workspace"),
        ...ensureIdentity("spot.terminal.projection.workspace"),
        ...ensureIdentity("spot.terminal.predicate.config"),
        ...ensureIdentity("spot.terminal.predicate.state"),
        ...ensureIdentity("relation.projection.type.instance"),
        ...ensureIdentity("relation.projection.predicate.observes"),
        ...ensureIdentity("relation.projection.predicate.uses"),
        { op: "put-node", node: { id: terminalId, relations: [constant("identity", "relation.core.identity", terminalId), ref("type", "relation.core.type", "spot.terminal.type.workspace"), constant("config", "spot.terminal.predicate.config", { apiBase: "http://127.0.0.1:8080" }), stateRelation(initialState())] } },
        { op: "put-node", node: { id: projectionId, relations: [constant("identity", "relation.core.identity", projectionId), ref("type", "relation.core.type", "relation.projection.type.instance"), ref("observes", "relation.projection.predicate.observes", terminalId), ref("uses", "relation.projection.predicate.uses", "spot.terminal.projection.workspace")] } },
      ] },
      addRootNodeIds: [projectionId], preferredProjection: { projectionId, width: 390, height: 720 },
    };
  },
};
