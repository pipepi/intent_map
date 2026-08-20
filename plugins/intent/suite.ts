import { decodeElementPackage, encodeElementPackage } from "../../app/_editor/plugin-editor/element-package.ts";
import { encodeCollectionPackage } from "../../app/_editor/plugin-editor/collection-package.ts";
import { decodeNodeTypePackage, encodeNodeTypePackage } from "../../app/_editor/plugin-editor/node-type-package.ts";
import type { NodeCollectionPlugin } from "../../app/_editor/plugin-editor/package-types.ts";
import { assertRelationGraph, type Relation } from "../../app/relation/model.ts";
import { baseElementManifest, baseNodeTypeManifest, constRelation, mergeGraphs, ontologyGraph, refRelation, relationNode } from "../relation-suite-helpers.ts";

export const INTENT_ELEMENT_PLUGIN_ID = "official.intent-elements";
export const INTENT_NODE_PLUGIN_ID = "official.intent-types";
export const INTENT_COLLECTION_ID = "official.intent-workspace";
export const INTENT_TYPES = ["composite", "operator", "linked-module", "loader", "renderer", "state", "action"].map((kind) => `intent.type.${kind}`);

const predicates = ["name", "description", "type", "input", "output", "contains", "position", "implementation", "module-ref", "binding"]
  .map((name) => relationNode(`intent.predicate.${name}`));
const types = INTENT_TYPES.map((id) => relationNode(id, [refRelation("type", "relation.core.type", "relation.core.type")]));
export const intentOntology = ontologyGraph([...predicates, ...types]);

const elementSource = `
const esc=value=>String(value??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const value=(node,id)=>node.relations.find(r=>r.id===id)?.object;
class IntentRelationNode extends HTMLElement{
  set context(next){this._context=next;this.render()}
  connectedCallback(){this.render()}
  render(){const c=this._context;if(!c?.node){this.textContent="等待 RelationNode";return}const n=c.node,name=value(n,"name")?.value??n.id;
    const inputs=n.relations.filter(r=>r.predicate.nodeId==="intent.predicate.input"),outputs=n.relations.filter(r=>r.predicate.nodeId==="intent.predicate.output");
    this.innerHTML='<style>:host{display:block;color:#e8edff}h3{margin:0 0 10px}small{color:#7785ad}.ports{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ports div{padding:7px;border:1px solid #33416c;border-radius:6px}input{width:100%;box-sizing:border-box;margin-top:10px;background:#090e20;color:white;border:1px solid #405083;padding:6px}</style><h3>'+esc(name)+'</h3><small>'+esc(n.id)+'</small><div class="ports"><div>输入<br>'+inputs.map(r=>esc(r.id)).join('<br>')+'</div><div>输出<br>'+outputs.map(r=>esc(r.id)).join('<br>')+'</div></div><input value="'+esc(name)+'" aria-label="节点名称">';
    this.querySelector('input').onchange=e=>{const old=n.relations.find(r=>r.id==="name");if(!old)return;this.dispatchEvent(new CustomEvent("intent-relation-request",{bubbles:true,composed:true,detail:{kind:"apply-patch",patch:{schemaVersion:1,baseRevision:c.graph.revision,operations:[{op:"put-relation",nodeId:n.id,relation:{...old,object:{kind:"const",value:e.target.value}}}]}}}))}
  }
}
customElements.define("intent-relation-node",IntentRelationNode);
`;

const nodeTypeSource = `
const target=(node,id)=>node.relations.find(r=>r.id===id)?.object?.target;
const scalar=(node,id)=>node.relations.find(r=>r.id===id)?.object?.value;
const typeIds=${JSON.stringify(INTENT_TYPES)};
export default function register(host){
  const releases=[];
  for(const nodeId of typeIds) releases.push(host.registerType({type:{nodeId,relationId:"identity"},name:nodeId.split(".").at(-1),element:{pluginId:"${INTENT_ELEMENT_PLUGIN_ID}",elementId:"node"},matches(node){return target(node,"type")?.nodeId===nodeId}}));
  releases.push(host.registerProjection({id:"intent.node",matches(node){return target(node,"type")?.nodeId?.startsWith("intent.type.")},element:{pluginId:"${INTENT_ELEMENT_PLUGIN_ID}",elementId:"node"}}));
  releases.push(host.registerValidator(graph=>{const parents=new Map();for(const node of Object.values(graph.nodes)){for(const relation of node.relations.filter(r=>r.predicate.nodeId==="intent.predicate.contains")){const child=relation.object.target?.nodeId;if(!child)throw new Error("contains must reference a node");if(parents.has(child)&&parents.get(child)!==node.id)throw new Error("Intent child has multiple parents");parents.set(child,node.id)}}for(const start of parents.keys()){const seen=new Set(),path=[];let at=start;while(at){if(seen.has(at))throw new Error("Intent contains cycle: "+[...path,at].join(" -> "));seen.add(at);path.push(at);at=parents.get(at)}}}));
  releases.push(host.registerCommand("intent.rename",(input,graph)=>{const node=graph.nodes[input.nodeId],old=node?.relations.find(r=>r.id==="name");if(!old||typeof input.name!=="string")throw new Error("Invalid rename command");return{schemaVersion:1,baseRevision:graph.revision,operations:[{op:"put-relation",nodeId:node.id,relation:{...old,object:{kind:"const",value:input.name}}}]}}));
  releases.push(host.registerExecutor("intent.evaluate",async(node,graph)=>{const output={};for(const relation of node.relations.filter(r=>r.predicate.nodeId==="intent.predicate.output")){const evaluate=o=>o.kind==="const"?o.value:o.kind==="ref"?graph.nodes[o.target.nodeId]?.relations.find(r=>r.id===o.target.relationId)?.object?.value:{op:o.op,args:o.args.map(evaluate)};output[relation.id]=evaluate(relation.object)}return output}));
  releases.push(host.registerLanguageProvider({id:"intent.zh",async describe({nodeId,graph}){const n=graph.nodes[nodeId];return n?String(scalar(n,"name")??n.id):""},async parse(){return[]}}));
  return()=>releases.reverse().forEach(release=>typeof release==="function"?release():release.dispose());
}
`;

const node = (id: string, name: string, type: string, extra: Relation[] = []) => relationNode(id, [
  constRelation("name", "intent.predicate.name", name),
  refRelation("type", "intent.predicate.type", `intent.type.${type}`),
  constRelation("position", "intent.predicate.position", { x: 0, y: 0 }),
  ...extra,
]);

export const intentCollectionGraph = mergeGraphs(intentOntology, ontologyGraph([
  node("intent.application-root", "Intent Map 应用根", "composite", [
    refRelation("contains:loader", "intent.predicate.contains", "intent.document-loader"),
    refRelation("contains:business", "intent.predicate.contains", "intent.business-root"),
  ]),
  node("intent.document-loader", "文档加载器", "loader", [constRelation("output:document", "intent.predicate.output", null)]),
  node("intent.business-root", "业务意图", "composite", [
    refRelation("contains:state", "intent.predicate.contains", "intent.app-state"),
    refRelation("contains:action", "intent.predicate.contains", "intent.render-action"),
  ]),
  node("intent.app-state", "应用状态", "state", [constRelation("output:snapshot", "intent.predicate.output", {})]),
  node("intent.render-action", "渲染动作", "action", [
    refRelation("input:state", "intent.predicate.input", "intent.app-state", "output:snapshot"),
    constRelation("output:done", "intent.predicate.output", true),
  ]),
]));
assertRelationGraph(intentCollectionGraph);

export async function buildIntentPluginSuite() {
  const elementManifest = { ...baseElementManifest(INTENT_ELEMENT_PLUGIN_ID, "Intent Elements"), elements: [{ id: "node", tag: "intent-relation-node", purpose: "node" as const }] };
  const elementArchive = await encodeElementPackage(elementManifest, elementSource, { "source/index.js": elementSource });
  const element = await decodeElementPackage(elementArchive);
  const nodeManifest = baseNodeTypeManifest(INTENT_NODE_PLUGIN_ID, "Intent Relation Types", INTENT_TYPES, INTENT_ELEMENT_PLUGIN_ID);
  const nodeArchive = await encodeNodeTypePackage(nodeManifest, intentOntology, nodeTypeSource, { "source/index.js": nodeTypeSource });
  const nodeType = await decodeNodeTypePackage(nodeArchive);
  const collection: NodeCollectionPlugin = {
    manifest: { format: "intent-node-collection", schemaVersion: 2, id: INTENT_COLLECTION_ID, name: "Intent Workspace", version: "1.0.0", rootNodeIds: ["intent.application-root"], dependencies: { nodeTypes: [{ id: INTENT_NODE_PLUGIN_ID, version: "1.0.0" }], elements: [{ id: INTENT_ELEMENT_PLUGIN_ID, version: "1.0.0" }] } },
    graph: intentCollectionGraph,
    workspace: { views: { kind: "workbench", panels: ["tree", "canvas", "properties"] }, initialSelection: ["intent.business-root"] },
  };
  const collectionArchive = encodeCollectionPackage({ collection, nodeTypes: [nodeType], elementPlugins: [element] });
  return { elementArchive, nodeTypeArchive: nodeArchive, collectionArchive, element, nodeType, collection };
}
