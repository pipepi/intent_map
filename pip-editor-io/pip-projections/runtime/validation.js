import { graphNodes } from "../../../pip-editor/pip/pip-model.ts";
import { P, definitionId, isProjection, observed, pipsBy, targetBy, targetOf } from "./selectors.js";

const supported = new Set(["pip.projection.definition.properties", "pip.projection.definition.contains", "pip.projection.definition.flow"]);

export function validateProjectionGraph(graph) {
  const parents = new Map();
  for (const projection of Object.values(graphNodes(graph)).filter(isProjection)) {
    const owner = observed(projection, graph), definition = definitionId(projection);
    if (!owner) throw new Error(`Projection ${projection.id} observes a missing node`);
        if (!supported.has(definition) && !definition?.startsWith("scene.projection."))
            throw new Error(`Projection ${projection.id} uses an unsupported definition`);
        if (definition === "pip.projection.definition.properties" && !targetBy(projection, P.divesInto))
            throw new Error(`Self projection ${projection.id} has no internal target`);
        if (!["pip.projection.definition.contains", "pip.projection.definition.flow"].includes(definition))
            continue;
        const predicate = targetBy(projection, P.childPredicate)?.node_id;
        if (!predicate)
            throw new Error(`Children projection ${projection.id} has no child predicate`);
        const children = owner.pips.filter((pip) => pip.predicate_value?.predicate.node_id === predicate).map(targetOf).filter(Boolean);
        const presented = pipsBy(projection, P.presents).map(targetOf).filter(Boolean).map((ref) => observed(graphNodes(graph)[ref.node_id], graph)?.id);
        if (children.some((ref) => !presented.includes(ref.node_id)) || presented.some((id) => !children.some((ref) => ref.node_id === id)))
            throw new Error(`Projection ${projection.id} does not mirror its direct children`);
        for (const child of children) {
            if (parents.has(child.node_id) && parents.get(child.node_id) !== owner.id)
                throw new Error(`Node ${child.node_id} has multiple parents`);
            parents.set(child.node_id, owner.id);
        }
    }
    // A single parent does not prevent A→B→A, so every parent chain is checked separately.
    for (const nodeId of parents.keys()) {
        const seen = new Set([nodeId]);
        let parent = parents.get(nodeId);
        while (parent) {
            if (seen.has(parent))
                throw new Error(`Contains cycle reaches ${parent}`);
            seen.add(parent);
            parent = parents.get(parent);
        }
    }
}
