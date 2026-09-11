import { PipForkLevel } from "../../../pip-editor/pip/types.ts";
import { graphNodes, graphRevision, setGraphRevision } from "../../../pip-editor/pip/pip-model.ts";
import { nameOf, role_pips, scalar, typeId } from "./selectors.js";

const identity = { node_id: "pip.core.identity", pip_id: "identity" };
const pip = (id, predicate, object) => ({ id, fork_level: PipForkLevel.PIPE, predicate_value: { predicate: { node_id: `scene.predicate.${predicate}`, pip_id: "identity" }, value: object }, pips: [] });
export const languageProvider = {
    id: "scene.zh",
    async describe({ nodeId, graph }) {
        const node = graphNodes(graph)[nodeId];
        if (!node)
            return "";
        if (typeId(node) !== "scene.type.event")
            return nameOf(graph, nodeId);
        const roles = role_pips(node);
        const names = (role) => roles.filter((item) => item.role === role).map(({ ref }) => nameOf(graph, ref.node_id));
        return [names("subject")[0], names("source")[0] && `从/用${names("source")[0]}`, names("object")[0] && `携带/处理${names("object")[0]}`, names("target")[0] && `到${names("target")[0]}`].filter(Boolean).join("");
    },
    async parse({ text, graph }) {
        const match = text.match(/^(.+?)用(.+?)购买(.+)$/);
        if (!match)
            return [];
        const find = (name) => Object.values(graphNodes(graph)).filter((node) => scalar(node, "name") === name);
        const groups = match.slice(1).map(find);
        if (groups.some((items) => items.length !== 1))
            return [{
                    id: "ambiguous", label: "名称存在缺失或歧义", confidence: 0,
                    diagnostics: groups.map((items, index) => `${match[index + 1]}:${items.length}`),
                    patch: { schemaVersion: 2, baseRevision: graphRevision(graph), operations: [] },
                }];
        const [subject, source, destination] = groups.map((items) => items[0]);
        const id = `scene.event.parsed-${setGraphRevision(graph, 1)}`;
        const node = { id, fork_level: PipForkLevel.NODE, pips: [
                { id: "identity", fork_level: PipForkLevel.PIPE, predicate_value: { predicate: identity, value: { kind: "const", value: id } }, pips: [] },
                pip("name", "name", { kind: "const", value: text }),
                pip("type", "type", { kind: "ref", target: { node_id: "scene.type.event", pip_id: "identity" } }),
                pip("subject:0", "subject", { kind: "ref", target: { node_id: subject.id, pip_id: "identity" } }),
                pip("source:0", "source", { kind: "ref", target: { node_id: source.id, pip_id: "identity" } }),
                pip("target:0", "target", { kind: "ref", target: { node_id: destination.id, pip_id: "identity" } }),
                pip("time", "time", { kind: "const", value: { start: 12, end: 12.25 } }),
            ] };
        const scene = Object.values(graphNodes(graph)).find((candidate) => typeId(candidate) === "scene.type.scene");
        const operations = [{ op: "put", parent_path: [], pip: node }];
        if (scene)
            operations.push({ op: "put", parent_path: [scene.id], pip: pip(`contains:${id}`, "contains", { kind: "ref", target: { node_id: id, pip_id: "identity" } }) });
        return [{ id: "scene.parse.purchase", label: "创建购买事件", confidence: 1, diagnostics: [], patch: { schemaVersion: 2, baseRevision: graphRevision(graph), operations } }];
    },
};
