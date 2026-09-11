import { PipForkLevel, type JsonValue, type Pip, type PipPredicateValue } from "./types.ts";
export const META = {
    revision: "pip.meta.revision",
    roots: "pip.meta.root-node-ids",
    workspace: "pip.meta.workspace",
} as const;
export function pipStatement(pip: Pip): PipPredicateValue {
    if (!pip.predicate_value) {
        throw new Error(`Pip ${pip.id} has no predicate/value`);
    }
    return pip.predicate_value;
}
const metadataId = (id: string) => id.replace(/^pip\.meta\./, "");
// 元数据由谓词识别；局部 ID 可避让业务节点，而不改变其身份与引用。
const is_metadata = (pip: Pip, predicate_id: string) =>
    pip.fork_level === PipForkLevel.PIPE && pip.predicate_value?.predicate.node_id === predicate_id;

function available_metadata_id(base_id: string, siblings: Pip[]): string {
    const used_ids = new Set(siblings.map(pip => pip.id));
    let candidate = base_id;
    let suffix = 1;
    while (used_ids.has(candidate)) {
        candidate = `${base_id}~${suffix++}`;
    }
    return candidate;
}
export const metadataPipe = (id: string, value: JsonValue): Pip => ({
    id: metadataId(id), fork_level: PipForkLevel.PIPE,
    predicate_value: {
        predicate: {
            node_id: id, pip_id: "identity"
        }, value: {
            kind: "const", value
        }
    },
    pips: [],
});
export function metadataValue(pip: Pip, id: string): JsonValue {
    const entries = pip.pips.filter(item => is_metadata(item, id));
    if (entries.length !== 1) {
        throw new Error(`Expected one metadata pipe ${id}`);
    }
    const pair = pipStatement(entries[0]);
    if (pair.predicate.node_id !== id || pair.predicate.pip_id !== "identity" || pair.value.kind !== "const") {
        throw new Error(`Invalid metadata pipe ${id}`);
    }
    return pair.value.value;
}
/** Ephemeral lookup only; the canonical node collection is graph.pips. */
export const graphNodes = (graph: Pip): Record<string, Pip> => Object.fromEntries(graph.pips.filter((pip) => pip.fork_level === PipForkLevel.NODE).map((node) => [node.id, node]));
export function setGraphNode(graph: Pip, node: Pip): void {
    if (node.fork_level !== PipForkLevel.NODE) {
        throw new Error(`Expected NODE Pip ${node.id}`);
    }
    const index = graph.pips.findIndex((item) => item.fork_level === PipForkLevel.NODE && item.id === node.id);
    if (index < 0) {
        const metadata = graph.pips.find(item => item.id === node.id && is_metadata(item, META.revision));
        if (metadata) {
            metadata.id = available_metadata_id(metadataId(META.revision), [...graph.pips, node]);
        }
        graph.pips.push(node);
    }
    else {
        graph.pips[index] = node;
    }
}
export function removeGraphNode(graph: Pip, id: string): void {
    graph.pips = graph.pips.filter((item) => item.fork_level !== PipForkLevel.NODE || item.id !== id);
}
export function graphRevision(graph: Pip): number {
    const revision = metadataValue(graph, META.revision);
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
        throw new Error("Invalid graph revision");
    }
    return revision;
}
export function setGraphRevision(graph: Pip, revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error("Invalid graph revision");
    }
    const index = graph.pips.findIndex(pip => is_metadata(pip, META.revision));
    const value = metadataPipe(META.revision, revision);
    if (index < 0) {
        value.id = available_metadata_id(value.id, graph.pips);
        graph.pips.push(value);
    }
    else {
        value.id = graph.pips[index].id;
        graph.pips[index] = value;
    }
}
export const createGraph = (nodes: Record<string, Pip>, revision = 0): Pip => {
    const node_list = Object.values(nodes);
    const revision_pipe = metadataPipe(META.revision, revision);
    revision_pipe.id = available_metadata_id(revision_pipe.id, node_list);
    return {
        id: "graph",
        fork_level: PipForkLevel.GRAPH,
        pips: [revision_pipe, ...node_list],
    };
};
