import { initialState, stateRelation } from "./state.js";

const ref = (id, predicate, target) => ({ id, predicate: { nodeId: predicate, relationId: "identity" }, object: { kind: "ref", target: { nodeId: target, relationId: "identity" } }, relations: [] });
const constant = (id, predicate, value) => ({ id, predicate: { nodeId: predicate, relationId: "identity" }, object: { kind: "const", value }, relations: [] });

export const terminalCreator = {
  id: "spot.terminal.create", label: "现货交易终端", description: "打开可独立切换本地或服务器环境的专业交易终端", category: "交易", icon: "↗",
  // Each terminal owns an isolated in-memory auth session, so one workspace may host multiple accounts.
  accepts() { return true; },
  create({ graph }) {
    const suffix = globalThis.crypto?.randomUUID?.() ?? Date.now(), terminalId = `spot.terminal:${suffix}`;
    const projectionId = `spot.terminal.view:${suffix}`, childrenId = `spot.terminal.children:${suffix}`;
    const worldId = `spot.terminal.world:${suffix}`, embeddedId = `spot.terminal.embedded:${suffix}`;
    const ensureIdentity = (id) => graph.nodes[id] ? [] : [{ op: "put-node", node: {
      id, relations: [constant("identity", "relation.core.identity", id)],
    } }];
    return {
      patch: { schemaVersion: 1, baseRevision: graph.revision, operations: [
        // Plugin registrations describe behavior, but graph references still require concrete identity nodes.
        ...ensureIdentity("spot.terminal.type.workspace"),
        ...ensureIdentity("spot.terminal.projection.workspace"),
        ...ensureIdentity("spot.terminal.projection.children"),
        ...ensureIdentity("spot.terminal.projection.world-events"),
        ...ensureIdentity("spot.terminal.projection.embedded"),
        ...ensureIdentity("spot.terminal.predicate.config"),
        ...ensureIdentity("spot.terminal.predicate.state"),
        ...ensureIdentity("relation.projection.type.instance"),
        ...ensureIdentity("relation.projection.predicate.observes"),
        ...ensureIdentity("relation.projection.predicate.uses"),
        ...ensureIdentity("relation.projection.predicate.dives-into"),
        { op: "put-node", node: { id: terminalId, relations: [constant("identity", "relation.core.identity", terminalId), ref("type", "relation.core.type", "spot.terminal.type.workspace"), constant("config", "spot.terminal.predicate.config", { environment: "local" }), stateRelation(initialState())] } },
        // Flow is the default child level. World Events is its sibling and navigation replaces
        // one with the other without adding a semantic zoom level.
        { op: "put-node", node: { id: projectionId, relations: [constant("identity", "relation.core.identity", projectionId), ref("type", "relation.core.type", "relation.projection.type.instance"), ref("observes", "relation.projection.predicate.observes", terminalId), ref("uses", "relation.projection.predicate.uses", "spot.terminal.projection.workspace"), ref("dives-into", "relation.projection.predicate.dives-into", childrenId)] } },
        { op: "put-node", node: { id: childrenId, relations: [constant("identity", "relation.core.identity", childrenId), ref("type", "relation.core.type", "relation.projection.type.instance"), ref("observes", "relation.projection.predicate.observes", terminalId), ref("uses", "relation.projection.predicate.uses", "spot.terminal.projection.children")] } },
        { op: "put-node", node: { id: worldId, relations: [constant("identity", "relation.core.identity", worldId), ref("type", "relation.core.type", "relation.projection.type.instance"), ref("observes", "relation.projection.predicate.observes", terminalId), ref("uses", "relation.projection.predicate.uses", "spot.terminal.projection.world-events")] } },
        { op: "put-node", node: { id: embeddedId, relations: [constant("identity", "relation.core.identity", embeddedId), ref("type", "relation.core.type", "relation.projection.type.instance"), ref("observes", "relation.projection.predicate.observes", terminalId), ref("uses", "relation.projection.predicate.uses", "spot.terminal.projection.embedded")] } },
      ] },
      addRootNodeIds: [projectionId], preferredProjection: { projectionId, width: 390, height: 720 },
    };
  },
};
