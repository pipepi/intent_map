import { PipForkLevel, type Pip, type PipIndex, type PipRef } from "./types.ts";
import { pipKey, visitPipValueRefs, walkPips } from "./traversal.ts";
export const createPipIndex = (graph: Pip): PipIndex => {
    const pips = new Map<string, Pip>();
    const addresses: PipIndex["refs"] = new Map();
    const outgoing = new Map<string, PipRef[]>(), incoming = new Map<string, PipRef[]>();
    const add = (owner: PipRef, target: PipRef) => {
        const source = pipKey(owner), key = pipKey(target);
        outgoing.set(source, [...(outgoing.get(source) ?? []), target]);
        incoming.set(key, [...(incoming.get(key) ?? []), owner]);
    };
    for (const node of graph.pips.filter(pip => pip.fork_level === PipForkLevel.NODE)) {
        walkPips(node.id, node.pips, (pip, address) => {
            const key = pipKey(address);
            if (pips.has(key)) {
                throw new Error(`Duplicate pip id ${node.id}/${pip.id}`);
            }
            pips.set(key, pip);
            addresses.set(key, address);
            if (pip.predicate_value) {
                const owner = {
                    node_id: address.node_id, pip_id: address.pip_id
                };
                add(owner, pip.predicate_value.predicate);
                visitPipValueRefs(pip.predicate_value.value, target => add(owner, target));
            }
        });
    }
    return {
        pips: pips, refs: addresses, outgoing, incoming
    };
};
