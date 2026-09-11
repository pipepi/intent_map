/** Input: recursive pips/objects. Output: stable addresses and referenced targets. */
import type { Pip, PipValue, PipRef } from "./types.ts";
const MAX_PIP_DEPTH = 64;
export const pipKey = ({ node_id: nodeId, pip_id: pip_id }: PipRef) => `${nodeId}\u0000${pip_id}`;
export const visitPipValueRefs = (object: PipValue, visit: (ref: PipRef) => void) => {
    if (object.kind === "ref") {
        visit(object.target);
    }
    if (object.kind === "op") {
        object.args.forEach((argument) => visitPipValueRefs(argument, visit));
    }
};
export const walkPips = (nodeId: string, pips: Pip[], visit: (pip: Pip, address: PipRef, depth: number) => void, pip_id_parent?: string, depth = 0) => {
    if (depth > MAX_PIP_DEPTH) {
        throw new Error(`Pip depth exceeds ${MAX_PIP_DEPTH}`);
    }
    for (const pip of pips) {
        visit(pip, {
            node_id: nodeId, pip_id: pip.id, pip_id_parent
        }, depth);
        walkPips(nodeId, pip.pips, visit, pip.id, depth + 1);
    }
};
export const pipValueRefs = (object: PipValue): PipRef[] => {
    const refs: PipRef[] = [];
    visitPipValueRefs(object, (ref) => refs.push(ref));
    return refs;
};
