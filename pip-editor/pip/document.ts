/** Portable DOCUMENT Pip; graphs and document metadata share the same shape. */
import { assertPipGraph, assertPip } from "./graph-validation.ts";
import { createPipIndex } from "./reference-index.ts";
import { graphNodes, META, metadataPipe, metadataValue } from "./pip-model.ts";
import { pipKey, pipValueRefs } from "./traversal.ts";
import { PipForkLevel, type JsonValue, type Pip } from "./types.ts";
import { legacyDocumentValues } from "./legacy-document.ts";
import { migrate_fork_levels } from "./legacy-fork-level.ts";
import { migrate_legacy_document } from "./legacy-semantics.ts";
export type PipDocumentValues = {
    graph: Pip;
    rootNodeIds: string[];
    workspace: JsonValue;
};
export function pipDocumentValues(document: Pip): PipDocumentValues {
    assertPip(document);
    if (document.fork_level !== PipForkLevel.DOCUMENT || document.id !== "pip-workspace@3") {
        throw new Error("Unsupported pip workspace document");
    }
    const graphs = document.pips.filter((pip) => pip.fork_level === PipForkLevel.GRAPH);
    if (graphs.length !== 1) {
        throw new Error("Document must contain exactly one GRAPH Pip");
    }
    const graph = graphs[0];
    assertPipGraph(graph);
    const rootNodeIds = metadataValue(document, META.roots), workspace = metadataValue(document, META.workspace);
    const nodes = graphNodes(graph);
    if (!Array.isArray(rootNodeIds) || rootNodeIds.some((id) => typeof id !== "string" || !nodes[id])) {
        throw new Error("Pip workspace contains an invalid root node");
    }
    const index = createPipIndex(graph);
    const check = (pip: Pip) => {
        if (pip.predicate_value) {
            for (const ref of [pip.predicate_value.predicate, ...pipValueRefs(pip.predicate_value.value)]) {
                if (!index.pips.has(pipKey(ref))) {
                    throw new Error("Dangling document metadata reference");
                }
            }
        }
        pip.pips.forEach(check);
    };
    check(document);
    return {
        graph, rootNodeIds: rootNodeIds as string[], workspace
    };
}
export function loadPipDocument(value: unknown): Pip {
    value = migrate_fork_levels(value);
    const legacy = legacyDocumentValues(value);
    if (legacy) {
        return createPipDocument(legacy.graph, legacy.rootNodeIds, legacy.workspace);
    }
    assertPip(value);
    const document = value.id === "relation-workspace@3"
        ? migrate_legacy_document(value)
        : structuredClone(value);
    pipDocumentValues(document);
    return document;
}
export const serializePipDocument = (document: Pip) => JSON.stringify(loadPipDocument(document), null, 2);
export const createPipDocument = (graph: Pip, rootNodeIds: string[], workspace: JsonValue = {}): Pip => loadPipDocument({
    id: "pip-workspace@3", fork_level: PipForkLevel.DOCUMENT,
    pips: [graph, metadataPipe(META.roots, rootNodeIds), metadataPipe(META.workspace, workspace)],
});
