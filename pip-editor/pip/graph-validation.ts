import { PipForkLevel, type JsonValue, type Pip, type PipRef, type PipValue } from "./types.ts";
import { createPipIndex } from "./reference-index.ts";
import { graphRevision } from "./pip-model.ts";
import { pipKey, pipValueRefs } from "./traversal.ts";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function assertId(value: unknown): asserts value is string {
    if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f]/.test(value)) {
        throw new Error("Invalid Pip id");
    }
}
function assertRef(value: unknown): asserts value is PipRef {
    if (!record(value)) {
        throw new Error("Invalid Pip reference");
    }
    assertId(value.node_id);
    assertId(value.pip_id);
    if (value.pip_id_parent !== undefined) {
        assertId(value.pip_id_parent);
    }
}
function assertJson(value: unknown, depth = 0): asserts value is JsonValue {
    if (depth > 128) {
        throw new Error("JSON depth exceeds 128");
    }
    if (value === null || typeof value === "string" || typeof value === "boolean") {
        return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return;
    }
    if (Array.isArray(value)) {
        return void value.forEach(item => assertJson(item, depth + 1));
    }
    if (record(value)) {
        return void Object.values(value).forEach(item => assertJson(item, depth + 1));
    }
    throw new Error("Invalid JSON value");
}
function assertValue(value: unknown, depth = 0): asserts value is PipValue {
    if (depth > 64 || !record(value)) {
        throw new Error("Invalid Pip value or excessive depth");
    }
    if (value.kind === "const") {
        return assertJson(value.value);
    }
    if (value.kind === "ref") {
        return assertRef(value.target);
    }
    if (value.kind === "op" && Array.isArray(value.args)) {
        assertId(value.op);
        value.args.forEach(item => assertValue(item, depth + 1));
        return;
    }
    throw new Error("Invalid Pip value kind");
}
export function assertPip(value: unknown, depth = 0): asserts value is Pip {
    if (depth > 64) {
        throw new Error("Pip depth exceeds 64");
    }
    if (!record(value) || !Array.isArray(value.pips)) {
        throw new Error("Invalid Pip");
    }
    if (Object.keys(value).some(key => !["id", "fork_level", "predicate_value", "pips"].includes(key))) {
        throw new Error("Unexpected field in Pip");
    }
    assertId(value.id);
    if (![0, 1, 2, 3].includes(value.fork_level as number)) {
        throw new Error("Invalid Pip fork_level");
    }
    if (value.predicate_value !== undefined) {
        if (!record(value.predicate_value)) {
            throw new Error("Invalid predicate_value pair");
        }
        assertRef(value.predicate_value.predicate);
        assertValue(value.predicate_value.value);
    }
    const ids = new Set<string>();
    for (const child of value.pips) {
        assertPip(child, depth + 1);
        if (ids.has(child.id)) {
            throw new Error(`Duplicate Pip id ${child.id}`);
        }
        ids.add(child.id);
        const allowed = value.fork_level === PipForkLevel.DOCUMENT ? [PipForkLevel.GRAPH, PipForkLevel.PIPE]
            : value.fork_level === PipForkLevel.GRAPH ? [PipForkLevel.NODE, PipForkLevel.PIPE] : [PipForkLevel.PIPE];
        if (!(allowed as number[]).includes(child.fork_level)) {
            throw new Error("Invalid nested Pip fork level");
        }
    }
}
export function assertPipGraph(value: unknown): asserts value is Pip {
    assertPip(value);
    if (value.fork_level !== PipForkLevel.GRAPH) {
        throw new Error("Invalid pip graph");
    }
    graphRevision(value);
    const index = createPipIndex(value);
    const check = (pip: Pip) => {
        if (pip.predicate_value) {
            for (const ref of [pip.predicate_value.predicate, ...pipValueRefs(pip.predicate_value.value)]) {
                const address = index.refs.get(pipKey(ref));
                if (!address) {
                    throw new Error(`Dangling pip reference to ${ref.node_id}/${ref.pip_id}`);
                }
                if (ref.pip_id_parent !== undefined && ref.pip_id_parent !== address.pip_id_parent) {
                    throw new Error("Pip reference parent does not match");
                }
            }
        }
        pip.pips.forEach(check);
    };
    check(value);
}
