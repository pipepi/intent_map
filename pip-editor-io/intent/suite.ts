import { decodeElementPackage, encodeElementPackage } from "../../pip-editor/relation-host/packages/element-package.ts";
import { encodeNodeMapPackage } from "../../pip-editor/relation-host/packages/node-map-package.ts";
import { decodeNodeTypePackage, encodeNodeTypePackage } from "../../pip-editor/relation-host/packages/node-type-package.ts";
import { exactPackageRef } from "../../pip-editor/relation-host/packages/pip-package.ts";
import type { NodeMap } from "../../pip-editor/relation-host/contracts/package-types.ts";
import { assertRelationGraph, type Relation, type RelationObject } from "../../pip-editor/relation/index.ts";
import { relationFlowOntology } from "../relation-projections/domain.ts";
import { buildRelationProjectionPlugins } from "../relation-projections/suite.ts";
import { baseElementManifest, baseNodeMapManifest, baseNodeTypeManifest } from "../shared/manifest-builders.ts";
import { constRelation, mergeGraphs, ontologyGraph, refRelation, relationNode } from "../shared/relation-builders.ts";

export const INTENT_ELEMENT_PLUGIN_ID = "official.intent-elements";
export const INTENT_NODE_PLUGIN_ID = "official.intent-types";
export const INTENT_NODE_MAP_ID = "official.intent-workspace";
export const INTENT_TYPES = ["composite", "operator", "linked-module", "loader", "renderer", "state", "action"].map((kind) => `intent.type.${kind}`);
const F = (name: string) => `relation.flow.predicate.${name}`;
const P = (name: string) => `relation.projection.predicate.${name}`;

const predicates = ["name", "description", "type", "position", "implementation", "module-ref"].map((name) => relationNode(`intent.predicate.${name}`));
const types = INTENT_TYPES.map((id) => relationNode(id, [refRelation("type", "relation.core.type", "relation.core.type")]));
export const intentOntology = mergeGraphs(relationFlowOntology, ontologyGraph([...predicates, ...types]));

const elementSource = `
const esc=value=>String(value??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
class IntentRelationNode extends HTMLElement{set context(v){this._context=v;this.render()}connectedCallback(){this.render()}render(){const c=this._context,n=c?.node;if(!n)return void(this.textContent="等待 RelationNode");const name=n.relations.find(r=>r.predicate.nodeId==="intent.predicate.name")?.object?.value??n.id;this.innerHTML='<style>:host{display:block;color:#e8edff;padding:10px}strong{display:block}small{color:#7785ad}</style><strong>'+esc(name)+'</strong><small>'+esc(n.id)+'</small>'}}
if(!customElements.get("intent-relation-node"))customElements.define("intent-relation-node",IntentRelationNode);
`;

const nodeTypeSource = `
const target=(node,predicate)=>node?.relations.find(r=>r.predicate.nodeId===predicate)?.object?.target;
const scalar=(node,predicate)=>node?.relations.find(r=>r.predicate.nodeId===predicate)?.object?.value;
const typeIds=${JSON.stringify(INTENT_TYPES)};
const projectionCreators=[
  ["properties","属性视图","▤","观察 Intent Map 应用根自身"],
  ["children","直接子级","⌘","观察应用根的直接子节点"],
  ["flow","执行流","⇄","观察应用根的端口、binding 与运行状态"],
].map(([mode,label,icon,description])=>{const projectionNodeId="intent.view."+mode+":intent.application-root";return{
  id:"intent.open-"+mode,label,description,icon,category:"Intent 投影",
  accepts({graph,rootNodeIds}){return Boolean(graph.nodes[projectionNodeId])&&!rootNodeIds.includes(projectionNodeId)},
  create(){return{addRootNodeIds:[projectionNodeId],preferredProjection:{projectionId:projectionNodeId,width:1120,height:720}}},
}});
export default function register(host){const releases=[];
for(const nodeId of typeIds)releases.push(host.registerType({type:{nodeId,relationId:"identity"},name:nodeId.split(".").at(-1),element:{pluginId:"${INTENT_ELEMENT_PLUGIN_ID}",elementId:"node"},matches(node){return target(node,"intent.predicate.type")?.nodeId===nodeId},label(node){return String(scalar(node,"intent.predicate.name")??node.id)}}));
releases.push(host.registerNodeRuntime({id:"intent.runtime",matches(node){return target(node,"intent.predicate.type")?.nodeId?.startsWith("intent.type.")&&!node.relations.some(r=>r.predicate.nodeId==="relation.flow.predicate.contains")},execute({node,inputs,state}){const type=target(node,"intent.predicate.type")?.nodeId;if(type==="intent.type.state"){const next=inputs["input:document"]??inputs.value??state??{};return{outputs:{"output:snapshot":next},state:next}}if(type==="intent.type.loader")return{outputs:{"output:document":inputs["input:source"]??{loaded:true}}};if(type==="intent.type.action")return{outputs:{"output:done":{rendered:inputs["input:state"]??null}}};return{outputs:{"output:value":inputs.value??inputs}}}}));
releases.push(host.registerExecutor("intent.evaluate",async(node)=>({nodeId:node.id})));
for(const creator of projectionCreators)releases.push(host.registerCreator(creator));
releases.push(host.registerValidator(graph=>{for(const node of Object.values(graph.nodes)){const type=target(node,"intent.predicate.type")?.nodeId;if(type?.startsWith("intent.type.")&&!graph.nodes[type])throw new Error("Intent type is missing")}}));
releases.push(host.registerLanguageProvider({id:"intent.zh",async describe({nodeId,graph}){const n=graph.nodes[nodeId];return n?String(scalar(n,"intent.predicate.name")??n.id):""},async parse(){return[]}}));
return()=>releases.reverse().forEach(release=>typeof release==="function"?release():release.dispose())}
`;

const binding = (portId: string, object: RelationObject): Relation => ({ id: `binding:${portId}`, predicate: { nodeId: F("binding"), relationId: "identity" }, object, relations: [] });
const port = (id: string, direction: "input" | "output", label: string, source?: RelationObject, required = true) => constRelation(id, F(direction), {
  key: id, label, required, queueCapacity: 64,
}, source ? [binding(id, source)] : []);
const ref = (nodeId: string, relationId: string): RelationObject => ({ kind: "ref", target: { nodeId, relationId } });
const node = (id: string, name: string, type: string, extra: Relation[] = []) => relationNode(id, [
  constRelation("name", "intent.predicate.name", name), refRelation("type", "intent.predicate.type", `intent.type.${type}`),
  constRelation("position", "intent.predicate.position", { x: 0, y: 0 }), ...extra,
]);

const businessNodes = [
  node("intent.application-root", "Intent Map 应用根", "composite", [
    port("input:source", "input", "环境输入", undefined, false), port("output:result", "output", "对外结果", ref("intent.business-root", "output:done")),
    refRelation("contains:loader", F("contains"), "intent.document-loader"), refRelation("contains:business", F("contains"), "intent.business-root"),
  ]),
  node("intent.document-loader", "文档加载器", "loader", [port("input:source", "input", "来源", ref("intent.application-root", "input:source"), false), port("output:document", "output", "文档")]),
  node("intent.business-root", "业务意图", "composite", [
    port("input:document", "input", "文档", ref("intent.document-loader", "output:document")), port("output:done", "output", "完成", ref("intent.render-action", "output:done")),
    refRelation("contains:state", F("contains"), "intent.app-state"), refRelation("contains:action", F("contains"), "intent.render-action"),
  ]),
  node("intent.app-state", "应用状态", "state", [port("input:document", "input", "文档", ref("intent.business-root", "input:document")), port("output:snapshot", "output", "状态")]),
  node("intent.render-action", "渲染动作", "action", [port("input:state", "input", "状态", ref("intent.app-state", "output:snapshot")), port("output:done", "output", "完成")]),
];

const projectionBase = (observed: string, uses: string) => [
  refRelation("type", "relation.core.type", "relation.projection.type.instance"), refRelation("observes", P("observes"), observed), refRelation("uses", P("uses"), uses),
];
const selfId = (id: string) => `intent.view.properties:${id}`, childrenId = (id: string) => `intent.view.children:${id}`, flowId = (id: string) => `intent.view.flow:${id}`;
const frame = (index: number) => ({ x: 70 + index * 390, y: 100, width: 340, height: 240, resizeMode: "simple" });
const projectionNodes = businessNodes.flatMap((business) => {
  const children = business.relations.flatMap((item) => item.predicate.nodeId === F("contains") && item.object.kind === "ref" ? [item.object.target.nodeId] : []);
  const presents = children.map((id, index) => refRelation(`presents:${index}`, P("presents"), selfId(id), "identity", [constRelation(`frame:${index}`, P("frame"), frame(index))]));
  const internal = (id: string, uses: string) => relationNode(id, [...projectionBase(business.id, uses), refRelation("child-predicate", P("child-predicate"), F("contains")), ...presents]);
  return [
    relationNode(selfId(business.id), [...projectionBase(business.id, "relation.projection.definition.properties"), refRelation("dives-into", P("dives-into"), childrenId(business.id))]),
    internal(childrenId(business.id), "relation.projection.definition.contains"), internal(flowId(business.id), "relation.projection.definition.flow"),
  ];
});
const manualTrigger = relationNode("intent.trigger.manual", [
  refRelation("type", "relation.core.type", "relation.trigger.type.manual"), refRelation("target", "relation.trigger.predicate.target", "intent.application-root"),
  constRelation("enabled", "relation.trigger.predicate.enabled", true), constRelation("overlap", "relation.trigger.predicate.overlap-policy", "queue"),
]);
export const intentNodeMapGraph = mergeGraphs(intentOntology, ontologyGraph([...businessNodes, ...projectionNodes, manualTrigger]));
assertRelationGraph(intentNodeMapGraph);

export async function buildIntentPluginSuite() {
  const support = await buildRelationProjectionPlugins();
  const elementManifest = { ...baseElementManifest(INTENT_ELEMENT_PLUGIN_ID, "Intent Elements"), packageVersion: "3.0.0", elements: [{ id: "node", tag: "intent-relation-node", purpose: "node" as const }] };
  const elementPip = await encodeElementPackage(elementManifest, elementSource, { "source/index.js": elementSource }), element = await decodeElementPackage(elementPip);
  const nodeManifest = { ...baseNodeTypeManifest(INTENT_NODE_PLUGIN_ID, "Intent Relation Types", INTENT_TYPES, [await exactPackageRef(elementPip, element.manifest)]), packageVersion: "3.0.0" };
  const nodeTypePip = await encodeNodeTypePackage(nodeManifest, intentOntology, nodeTypeSource, { "source/index.js": nodeTypeSource }), nodeType = await decodeNodeTypePackage(nodeTypePip);
  const nodeMap: NodeMap = {
    manifest: { ...baseNodeMapManifest(INTENT_NODE_MAP_ID, "Intent Workspace", [], [await exactPackageRef(support.nodeTypePip, support.nodeType.manifest), await exactPackageRef(nodeTypePip, nodeType.manifest)]), packageVersion: "3.0.0" },
    graph: intentNodeMapGraph,
    workspace: { views: { kind: "free-layout", world: { width: 2600, height: 1600 }, camera: { scale: 1, x: 0, y: 0 }, projections: {}, systemWindows: {} }, initialSelection: [] },
  };
  const nodeMapPip = await encodeNodeMapPackage({ nodeMap, nodeTypes: [support.nodeType, nodeType], elementPlugins: [support.element, element] });
  return { elementPip, nodeTypePip, nodeMapPip, element, nodeType, nodeMap, support };
}
