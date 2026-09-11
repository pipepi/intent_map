import { PipForkLevel } from "../../pip-editor/pip/types.ts";
import { decodeElementPackage, encodeElementPackage } from "../../pip-editor/pip-host/packages/element-package.ts";
import { encodeNodeMapPackage } from "../../pip-editor/pip-host/packages/node-map-package.ts";
import { decodeNodeTypePackage, encodeNodeTypePackage } from "../../pip-editor/pip-host/packages/node-type-package.ts";
import { exactPackageRef } from "../../pip-editor/pip-host/packages/pip-package.ts";
import type { NodeMap } from "../../pip-editor/pip-host/contracts/package-types.ts";
import { assertPipGraph, type Pip, type PipValue } from "../../pip-editor/pip/index.ts";
import { pipFlowOntology } from "../pip-projections/domain.ts";
import { buildPipProjectionPlugins } from "../pip-projections/suite.ts";
import { baseElementManifest, baseNodeMapManifest, baseNodeTypeManifest } from "../shared/manifest-builders.ts";
import { constPip, mergeGraphs, ontologyGraph, refPip, pipNode } from "../shared/pip-builders.ts";

export const INTENT_ELEMENT_PLUGIN_ID = "official.intent-elements";
export const INTENT_NODE_PLUGIN_ID = "official.intent-types";
export const INTENT_NODE_MAP_ID = "official.intent-workspace";
export const INTENT_TYPES = ["composite", "operator", "linked-module", "loader", "renderer", "state", "action"].map((kind) => `intent.type.${kind}`);
const F = (name: string) => `pip.flow.predicate.${name}`;
const P = (name: string) => `pip.projection.predicate.${name}`;
const predicates = ["name", "description", "type", "position", "implementation", "module-ref"].map((name) => pipNode(`intent.predicate.${name}`));
const types = INTENT_TYPES.map((id) => pipNode(id, [refPip("type", "pip.core.type", "pip.core.type")]));
export const intentOntology = mergeGraphs(pipFlowOntology, ontologyGraph([...predicates, ...types]));
const elementSource = `
const esc=value=>String(value??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
class IntentPipNode extends HTMLElement{set context(v){this._context=v;this.render()}connectedCallback(){this.render()}render(){const c=this._context,n=c?.node;if(!n)return void(this.textContent="等待 Pip");const name=n.pips.find(r=>r.predicate_value?.predicate.node_id==="intent.predicate.name")?.predicate_value?.value?.value??n.id;this.innerHTML='<style>:host{display:block;color:#e8edff;padding:10px}strong{display:block}small{color:#7785ad}</style><strong>'+esc(name)+'</strong><small>'+esc(n.id)+'</small>'}}
if(!customElements.get("intent-pip-node"))customElements.define("intent-pip-node",IntentPipNode);
`;
const nodeTypeSource = `
const nodesOf=graph=>Object.fromEntries(graph.pips.filter(p=>p.fork_level==="node").map(p=>[p.id,p]));
const target=(node,predicate)=>node?.pips.find(r=>r.predicate_value?.predicate.node_id===predicate)?.predicate_value?.value?.target;
const scalar=(node,predicate)=>node?.pips.find(r=>r.predicate_value?.predicate.node_id===predicate)?.predicate_value?.value?.value;
const typeIds=${JSON.stringify(INTENT_TYPES)};
const projectionCreators=[
  ["properties","属性视图","▤","观察 Intent Map 应用根自身"],
  ["children","直接子级","⌘","观察应用根的直接子节点"],
  ["flow","执行流","⇄","观察应用根的端口、binding 与运行状态"],
].map(([mode,label,icon,description])=>{const projectionNodeId="intent.view."+mode+":intent.application-root";return{
  id:"intent.open-"+mode,label,description,icon,category:"Intent 投影",
  accepts({graph,rootNodeIds}){return Boolean(nodesOf(graph)[projectionNodeId])&&!rootNodeIds.includes(projectionNodeId)},
  create(){return{addRootNodeIds:[projectionNodeId],preferredProjection:{projectionId:projectionNodeId,width:1120,height:720}}},
}});
export default function register(host){const releases=[];
for(const nodeId of typeIds)releases.push(host.registerType({type:{node_id:nodeId,pip_id:"identity"},name:nodeId.split(".").at(-1),element:{pluginId:"${INTENT_ELEMENT_PLUGIN_ID}",elementId:"node"},matches(node){return target(node,"intent.predicate.type")?.node_id===nodeId},label(node){return String(scalar(node,"intent.predicate.name")??node.id)}}));
releases.push(host.registerNodeRuntime({id:"intent.runtime",matches(node){return target(node,"intent.predicate.type")?.node_id?.startsWith("intent.type.")&&!node.pips.some(r=>r.predicate_value?.predicate.node_id==="pip.flow.predicate.contains")},execute({node,inputs,state}){const type=target(node,"intent.predicate.type")?.node_id;if(type==="intent.type.state"){const next=inputs["input:document"]??inputs.value??state??{};return{outputs:{"output:snapshot":next},state:next}}if(type==="intent.type.loader")return{outputs:{"output:document":inputs["input:source"]??{loaded:true}}};if(type==="intent.type.action")return{outputs:{"output:done":{rendered:inputs["input:state"]??null}}};return{outputs:{"output:value":inputs.value??inputs}}}}));
releases.push(host.registerExecutor("intent.evaluate",async(node)=>({nodeId:node.id})));
for(const creator of projectionCreators)releases.push(host.registerCreator(creator));
releases.push(host.registerValidator(graph=>{for(const node of Object.values(nodesOf(graph))){const type=target(node,"intent.predicate.type")?.node_id;if(type?.startsWith("intent.type.")&&!nodesOf(graph)[type])throw new Error("Intent type is missing")}}));
releases.push(host.registerLanguageProvider({id:"intent.zh",async describe({nodeId,graph}){const n=nodesOf(graph)[nodeId];return n?String(scalar(n,"intent.predicate.name")??n.id):""},async parse(){return[]}}));
return()=>releases.reverse().forEach(release=>typeof release==="function"?release():release.dispose())}
`;
const binding = (portId: string, object: PipValue): Pip => ({ id: `binding:${portId}`, fork_level: PipForkLevel.PIPE, predicate_value: { predicate: { node_id: F("binding"), pip_id: "identity" }, value: object }, pips: [] });
const port = (id: string, direction: "input" | "output", label: string, source?: PipValue, required = true) => constPip(id, F(direction), {
    key: id, label, required, queueCapacity: 64,
}, source ? [binding(id, source)] : []);
const ref = (nodeId: string, pip_id: string): PipValue => ({ kind: "ref", target: { node_id: nodeId, pip_id: pip_id } });
const node = (id: string, name: string, type: string, extra: Pip[] = []) => pipNode(id, [
    constPip("name", "intent.predicate.name", name), refPip("type", "intent.predicate.type", `intent.type.${type}`),
    constPip("position", "intent.predicate.position", { x: 0, y: 0 }), ...extra,
]);
const businessNodes = [
  node("intent.application-root", "Intent Map 应用根", "composite", [
    port("input:source", "input", "环境输入", undefined, false), port("output:result", "output", "对外结果", ref("intent.business-root", "output:done")),
    refPip("contains:loader", F("contains"), "intent.document-loader"), refPip("contains:business", F("contains"), "intent.business-root"),
  ]),
  node("intent.document-loader", "文档加载器", "loader", [port("input:source", "input", "来源", ref("intent.application-root", "input:source"), false), port("output:document", "output", "文档")]),
  node("intent.business-root", "业务意图", "composite", [
    port("input:document", "input", "文档", ref("intent.document-loader", "output:document")), port("output:done", "output", "完成", ref("intent.render-action", "output:done")),
    refPip("contains:state", F("contains"), "intent.app-state"), refPip("contains:action", F("contains"), "intent.render-action"),
  ]),
  node("intent.app-state", "应用状态", "state", [port("input:document", "input", "文档", ref("intent.business-root", "input:document")), port("output:snapshot", "output", "状态")]),
  node("intent.render-action", "渲染动作", "action", [port("input:state", "input", "状态", ref("intent.app-state", "output:snapshot")), port("output:done", "output", "完成")]),
];
const projectionBase = (observed: string, uses: string) => [
  refPip("type", "pip.core.type", "pip.projection.type.instance"), refPip("observes", P("observes"), observed), refPip("uses", P("uses"), uses),
];
const selfId = (id: string) => `intent.view.properties:${id}`, childrenId = (id: string) => `intent.view.children:${id}`, flowId = (id: string) => `intent.view.flow:${id}`;
const frame = (index: number) => ({ x: 70 + index * 390, y: 100, width: 340, height: 240, resizeMode: "simple" });
const projectionNodes = businessNodes.flatMap((business) => {
    const children = business.pips.flatMap((item) => item.predicate_value?.predicate.node_id === F("contains") && item.predicate_value!.value.kind === "ref" ? [item.predicate_value!.value.target.node_id] : []);
    const presents = children.map((id, index) => refPip(`presents:${index}`, P("presents"), selfId(id), "identity", [constPip(`frame:${index}`, P("frame"), frame(index))]));
    const internal = (id: string, uses: string) => pipNode(id, [...projectionBase(business.id, uses), refPip("child-predicate", P("child-predicate"), F("contains")), ...presents]);
    return [
        pipNode(selfId(business.id), [...projectionBase(business.id, "pip.projection.definition.properties"), refPip("dives-into", P("dives-into"), childrenId(business.id))]),
        internal(childrenId(business.id), "pip.projection.definition.contains"), internal(flowId(business.id), "pip.projection.definition.flow"),
    ];
});
const manualTrigger = pipNode("intent.trigger.manual", [
  refPip("type", "pip.core.type", "pip.trigger.type.manual"), refPip("target", "pip.trigger.predicate.target", "intent.application-root"),
  constPip("enabled", "pip.trigger.predicate.enabled", true), constPip("overlap", "pip.trigger.predicate.overlap-policy", "queue"),
]);
export const intentNodeMapGraph = mergeGraphs(intentOntology, ontologyGraph([...businessNodes, ...projectionNodes, manualTrigger]));
assertPipGraph(intentNodeMapGraph);
export async function buildIntentPluginSuite() {
  const support = await buildPipProjectionPlugins();
  const elementManifest = { ...baseElementManifest(INTENT_ELEMENT_PLUGIN_ID, "Intent Elements"), packageVersion: "3.0.0", elements: [{ id: "node", tag: "intent-pip-node", purpose: "node" as const }] };
  const elementPip = await encodeElementPackage(elementManifest, elementSource, { "source/index.js": elementSource }), element = await decodeElementPackage(elementPip);
  const nodeManifest = { ...baseNodeTypeManifest(INTENT_NODE_PLUGIN_ID, "Intent Pip Types", INTENT_TYPES, [await exactPackageRef(elementPip, element.manifest)]), packageVersion: "3.0.0" };
  const nodeTypePip = await encodeNodeTypePackage(nodeManifest, intentOntology, nodeTypeSource, { "source/index.js": nodeTypeSource }, [element]), nodeType = await decodeNodeTypePackage(nodeTypePip);
  const nodeMap: NodeMap = {
    manifest: { ...baseNodeMapManifest(INTENT_NODE_MAP_ID, "Intent Workspace", [], [await exactPackageRef(support.nodeTypePip, support.nodeType.manifest), await exactPackageRef(nodeTypePip, nodeType.manifest)]), packageVersion: "3.0.0" },
    graph: intentNodeMapGraph,
    workspace: { views: { kind: "free-layout", world: { width: 2600, height: 1600 }, camera: { scale: 1, x: 0, y: 0 }, projections: {}, systemWindows: {} }, initialSelection: [] },
  };
  const nodeMapPip = await encodeNodeMapPackage({ nodeMap, nodeTypes: [support.nodeType, nodeType], elementPlugins: [support.element, element] });
  return { elementPip, nodeTypePip, nodeMapPip, element, nodeType, nodeMap, support };
}
