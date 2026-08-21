import { nameOf, roleRelations, scalar, typeId } from "./selectors.js";

const identity = { nodeId: "relation.core.identity", relationId: "identity" };
const relation = (id, predicate, object) => ({ id, predicate: { nodeId: `scene.predicate.${predicate}`, relationId: "identity" }, object, relations: [] });
export const languageProvider = {
  id: "scene.zh",
  async describe({ nodeId, graph }) {
    const node = graph.nodes[nodeId];
    if (!node) return "";
    if (typeId(node) !== "scene.type.event") return nameOf(graph, nodeId);
    const roles = roleRelations(node);
    const names = (role) => roles.filter((item) => item.role === role).map(({ ref }) => nameOf(graph, ref.nodeId));
    return [names("subject")[0], names("source")[0] && `从/用${names("source")[0]}`, names("object")[0] && `携带/处理${names("object")[0]}`, names("target")[0] && `到${names("target")[0]}`].filter(Boolean).join("");
  },
  async parse({ text, graph }) {
    const match = text.match(/^(.+?)用(.+?)购买(.+)$/);
    if (!match) return [];
    const find = (name) => Object.values(graph.nodes).filter((node) => scalar(node, "name") === name);
    const groups = match.slice(1).map(find);
    if (groups.some((items) => items.length !== 1)) return [{
      id: "ambiguous", label: "名称存在缺失或歧义", confidence: 0,
      diagnostics: groups.map((items, index) => `${match[index + 1]}:${items.length}`),
      patch: { schemaVersion: 1, baseRevision: graph.revision, operations: [] },
    }];
    const [subject, source, destination] = groups.map((items) => items[0]);
    const id = `scene.event.parsed-${graph.revision + 1}`;
    const node = { id, relations: [
      { id: "identity", predicate: identity, object: { kind: "const", value: id }, relations: [] },
      relation("name", "name", { kind: "const", value: text }),
      relation("type", "type", { kind: "ref", target: { nodeId: "scene.type.event", relationId: "identity" } }),
      relation("subject:0", "subject", { kind: "ref", target: { nodeId: subject.id, relationId: "identity" } }),
      relation("source:0", "source", { kind: "ref", target: { nodeId: source.id, relationId: "identity" } }),
      relation("target:0", "target", { kind: "ref", target: { nodeId: destination.id, relationId: "identity" } }),
      relation("time", "time", { kind: "const", value: { start: 12, end: 12.25 } }),
    ] };
    const scene = Object.values(graph.nodes).find((candidate) => typeId(candidate) === "scene.type.scene");
    const operations = [{ op: "put-node", node }];
    if (scene) operations.push({ op: "put-relation", nodeId: scene.id, relation: relation(`contains:${id}`, "contains", { kind: "ref", target: { nodeId: id, relationId: "identity" } }) });
    return [{ id: "scene.parse.purchase", label: "创建购买事件", confidence: 1, diagnostics: [], patch: { schemaVersion: 1, baseRevision: graph.revision, operations } }];
  },
};
