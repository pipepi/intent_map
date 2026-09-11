/** Atomic path-based edits for any Pip root, with reversible sibling ordering. */
import { PipForkLevel, type AppliedPipTx, type Pip, type PipTx, type PipOp } from "./types.ts";
import { assertPip, assertPipGraph } from "./graph-validation.ts";
import { pipDocumentValues } from "./document.ts";
import { graphRevision, setGraphRevision } from "./pip-model.ts";
function revisionGraph(root: Pip): Pip | undefined {
    if (root.fork_level === PipForkLevel.GRAPH) {
        return root;
    }
    if (root.fork_level === PipForkLevel.DOCUMENT) {
        const graphs = root.pips.filter(pip => pip.fork_level === PipForkLevel.GRAPH);
        if (graphs.length !== 1) {
            throw new Error("Document must contain exactly one GRAPH Pip");
        }
        return graphs[0];
    }
}
function validate(root: Pip): void {
    if (root.fork_level === PipForkLevel.DOCUMENT) {
        pipDocumentValues(root);
    }
    else if (root.fork_level === PipForkLevel.GRAPH) {
        assertPipGraph(root);
    }
    else {
        assertPip(root);
    }
}
function validId(id: unknown): id is string {
    return typeof id === "string" && Boolean(id.trim()) && !/[\u0000-\u001f]/.test(id);
}
function parentAt(root: Pip, path: unknown): Pip {
    if (!Array.isArray(path) || path.length > 64 || !path.every(validId)) {
        throw new Error("Invalid Pip parent_path");
    }
    let parent = root;
    for (const id of path) {
        const child = parent.pips.find(pip => pip.id === id);
        if (!child) {
            throw new Error(`Unknown Pip parent path: ${JSON.stringify(path)}`);
        }
        parent = child;
    }
    return parent;
}
export function applyPipTx(source: Pip, patch: PipTx): AppliedPipTx {
    assertPip(source);
    validate(source);
    if (patch.schemaVersion !== 2) {
        throw new Error(`Unsupported Pip patch schema ${patch.schemaVersion}`);
    }
    if (!Array.isArray(patch.operations)) {
        throw new Error("Invalid Pip patch operations");
    }
    const initialGraph = revisionGraph(source);
    const revision = initialGraph ? graphRevision(initialGraph) : undefined;
    if (revision !== undefined ? patch.baseRevision !== revision : patch.baseRevision !== undefined) {
        throw new Error(`Stale Pip patch: expected revision ${revision ?? "none for standalone Pip"}`);
    }
    const pip = structuredClone(source);
    let inverse: PipOp[] = [];
    for (const operation of patch.operations) {
        if (!operation || (operation.op !== "put" && operation.op !== "remove")) {
            throw new Error("Unsupported Pip patch operation");
        }
        const parent = parentAt(pip, operation.parent_path);
        if (operation.op === "put") {
            assertPip(operation.pip);
        }
        const id = operation.op === "put" ? operation.pip.id : operation.pip_id;
        if (!validId(id)) {
            throw new Error("Invalid Pip operation id");
        }
        const position = parent.pips.findIndex(child => child.id === id);
        const path = [...operation.parent_path];
        if (operation.op === "put") {
            const previous = parent.pips[position];
            inverse.unshift(previous
                ? {
                    op: "put", parent_path: path, pip: structuredClone(previous)
                } : {
                op: "remove", parent_path: path, pip_id: id
            });
            if (position < 0) {
                parent.pips.push(structuredClone(operation.pip));
            }
            else {
                parent.pips[position] = structuredClone(operation.pip);
            }
        }
        else {
            if (position < 0) {
                throw new Error(`Unknown Pip ${id} at ${JSON.stringify(path)}`);
            }
            // Reinsert the removed child in its original position using only put/remove.
            const suffix = structuredClone(parent.pips.slice(position + 1));
            const previous = structuredClone(parent.pips[position]);
            const restore: PipOp[] = [
                ...suffix.map(child => ({
                    op: "remove" as const, parent_path: [...path], pip_id: child.id
                })),
                {
                    op: "put", parent_path: [...path], pip: previous
                },
                ...suffix.map(child => ({
                    op: "put" as const, parent_path: [...path], pip: child
                })),
            ];
            inverse = [...restore, ...inverse];
            parent.pips.splice(position, 1);
        }
    }
    if (revision !== undefined) {
        const graph = revisionGraph(pip);
        if (!graph) {
            throw new Error("Versioned Pip lost its graph");
        }
        // Metadata may be reordered/restored by inverse operations, but the committed
        // revision always comes from this transaction's baseRevision.
        graphRevision(graph);
        setGraphRevision(graph, revision + 1);
    }
    validate(pip);
    return {
        pip, inverse: {
            schemaVersion: 2, ...(revision !== undefined ? { baseRevision: revision + 1 } : {}), operations: inverse
        }
    };
}
