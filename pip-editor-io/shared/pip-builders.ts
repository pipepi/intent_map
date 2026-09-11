import { PipForkLevel } from "../../pip-editor/pip/types.ts";
import { setGraphNode, graphNodes, createGraph } from "../../pip-editor/pip/pip-model.ts";
import { createCorePipGraph, type JsonValue, type Pip, type PipRef } from "../../pip-editor/pip/index.ts";
export const CORE_IDENTITY: PipRef = {
    node_id: "pip.core.identity",
    pip_id: "identity"
};
export const identityPip = (id: string): Pip => ({
    id: "identity",
    fork_level: PipForkLevel.PIPE,
    predicate_value: {
        predicate: CORE_IDENTITY, value: {
            kind: "const", value: id
        }
    },
    pips: []
});
export const constPip = (id: string, predicateNodeId: string, value: JsonValue, pips: Pip[] = []): Pip => ({
    id,
    fork_level: PipForkLevel.PIPE,
    predicate_value: {
        predicate: {
            node_id: predicateNodeId, pip_id: "identity"
        }, value: {
            kind: "const", value
        }
    },
    pips: pips
});
export const refPip = (id: string, predicateNodeId: string, nodeId: string, pip_id = "identity", pips: Pip[] = []): Pip => ({
    id,
    fork_level: PipForkLevel.PIPE,
    predicate_value: {
        predicate: {
            node_id: predicateNodeId, pip_id: "identity"
        }, value: {
            kind: "ref", target: {
                node_id: nodeId, pip_id: pip_id
            }
        }
    },
    pips: pips
});
export const pipNode = (id: string, pips: Pip[] = []): Pip => ({
    id, fork_level: PipForkLevel.NODE, pips: [identityPip(id), ...pips]
});
export const ontologyGraph = (nodes: Pip[]): Pip => {
    const graph = createCorePipGraph();
    for (const node of nodes) {
        setGraphNode(graph, node);
    }
    return graph;
};
export const mergeGraphs = (...graphs: Pip[]): Pip => (createGraph(Object.assign({}, ...graphs.map((graph) => structuredClone(graphNodes(graph)))), 0));
