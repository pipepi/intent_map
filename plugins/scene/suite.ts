import { decodeElementPackage, encodeElementPackage } from "../../app/_editor/plugin-editor/element-package.ts";
import { encodeCollectionPackage } from "../../app/_editor/plugin-editor/collection-package.ts";
import { decodeNodeTypePackage, encodeNodeTypePackage } from "../../app/_editor/plugin-editor/node-type-package.ts";
import type { NodeCollectionPlugin } from "../../app/_editor/plugin-editor/package-types.ts";
import { assertRelationGraph } from "../../app/relation/model.ts";
import { baseElementManifest, baseNodeTypeManifest, constRelation, mergeGraphs, ontologyGraph, refRelation, relationNode } from "../relation-suite-helpers.ts";

export const SCENE_ELEMENT_PLUGIN_ID = "official.scene-elements";
export const SCENE_NODE_PLUGIN_ID = "official.scene-types";
export const SCENE_COLLECTION_ID = "official.today-scene";
export const SCENE_TYPES = ["person", "physical", "virtual", "event"].map((kind) => `scene.type.${kind}`);
const predicateNames = ["name", "type", "position", "time", "subject", "source", "target", "object"];
const predicates = predicateNames.map((name) => relationNode(`scene.predicate.${name}`));
const types = SCENE_TYPES.map((id) => relationNode(id, [refRelation("type", "relation.core.type", "relation.core.type")]));
export const sceneOntology = ontologyGraph([...predicates, ...types]);

const elementSource = `
const esc=value=>String(value??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const rel=(node,id)=>node.relations.find(r=>r.id===id),scalar=(node,id)=>rel(node,id)?.object?.value;
class SceneRelationNode extends HTMLElement{
  set context(next){this._context=next;this.render()}
  connectedCallback(){this.render()}
  render(){const c=this._context;if(!c?.node)return;const n=c.node,type=rel(n,"type")?.object?.target?.nodeId?.split(".").at(-1),links=n.relations.filter(r=>["subject","source","target","object"].includes(r.id));
    const targets=links.map(r=>c.graph.nodes[r.object.target?.nodeId]).filter(Boolean),points=targets.map(t=>scalar(t,"position")).filter(Boolean);const center=points.length?{x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length}:scalar(n,"position");
    this.innerHTML='<style>:host{display:block;color:#eef2ff}.kind{color:#9a8cff;text-transform:uppercase}.links{display:grid;gap:5px;margin-top:10px}.links div{display:flex;justify-content:space-between;border-bottom:1px solid #283252;padding:4px 0}.pos{color:#7684ad;font-size:11px}</style><span class="kind">'+esc(type)+'</span><h3>'+esc(scalar(n,"name")??n.id)+'</h3><div class="pos">'+(center?'投影位置 '+center.x.toFixed(2)+' / '+center.y.toFixed(2):'无空间位置')+'</div><div class="links">'+links.map(r=>'<div><span>'+esc(r.id)+'</span><strong>'+esc(scalar(c.graph.nodes[r.object.target.nodeId],"name")??r.object.target.nodeId)+'</strong></div>').join('')+'</div>';
  }
}
customElements.define("scene-relation-node",SceneRelationNode);
`;

const nodeTypeSource = `
const typeIds=${JSON.stringify(SCENE_TYPES)};
const rel=(node,id)=>node?.relations.find(r=>r.id===id),scalar=(node,id)=>rel(node,id)?.object?.value,target=(node,id)=>rel(node,id)?.object?.target;
const nameOf=(graph,id)=>String(scalar(graph.nodes[id],"name")??id);
const identity={nodeId:"relation.core.identity",relationId:"identity"};
const relation=(id,predicate,object)=>({id,predicate:{nodeId:"scene.predicate."+predicate,relationId:"identity"},object,relations:[]});
export default function register(host){const releases=[];
  for(const nodeId of typeIds) releases.push(host.registerType({type:{nodeId,relationId:"identity"},name:nodeId.split(".").at(-1),element:{pluginId:"${SCENE_ELEMENT_PLUGIN_ID}",elementId:"node"},matches(node){return target(node,"type")?.nodeId===nodeId}}));
  releases.push(host.registerProjection({id:"scene.node",matches(node){return target(node,"type")?.nodeId?.startsWith("scene.type.")},element:{pluginId:"${SCENE_ELEMENT_PLUGIN_ID}",elementId:"node"}}));
  releases.push(host.registerValidator(graph=>{for(const node of Object.values(graph.nodes)){if(target(node,"type")?.nodeId!=="scene.type.event")continue;for(const role of ["subject","source","target","object"]){const value=rel(node,role);if(value&&value.object.kind!=="ref")throw new Error("Scene "+role+" must reference a RelationNode")}}}));
  releases.push(host.registerLanguageProvider({id:"scene.zh",async describe({nodeId,graph}){const n=graph.nodes[nodeId];if(!n)return"";if(target(n,"type")?.nodeId!=="scene.type.event")return nameOf(graph,nodeId);const subject=target(n,"subject"),source=target(n,"source"),dest=target(n,"target"),object=target(n,"object");return [subject&&nameOf(graph,subject.nodeId),source&&"用"+nameOf(graph,source.nodeId),object&&"处理"+nameOf(graph,object.nodeId),dest&&"到"+nameOf(graph,dest.nodeId)].filter(Boolean).join("")},async parse({text,graph}){const match=text.match(/^(.+?)用(.+?)购买(.+)$/);if(!match)return[];const find=name=>Object.values(graph.nodes).filter(n=>scalar(n,"name")===name);const groups=match.slice(1).map(find);if(groups.some(items=>items.length!==1))return[{id:"ambiguous",label:"名称存在缺失或歧义",confidence:0,diagnostics:groups.map((items,i)=>match[i+1]+":"+items.length),patch:{schemaVersion:1,baseRevision:graph.revision,operations:[]}}];const [subject,source,dest]=groups.map(items=>items[0]);const id="scene.event.parsed-"+(graph.revision+1);const node={id,relations:[{id:"identity",predicate:identity,object:{kind:"const",value:id},relations:[]},relation("name","name",{kind:"const",value:text}),relation("type","type",{kind:"ref",target:{nodeId:"scene.type.event",relationId:"identity"}}),relation("subject","subject",{kind:"ref",target:{nodeId:subject.id,relationId:"identity"}}),relation("source","source",{kind:"ref",target:{nodeId:source.id,relationId:"identity"}}),relation("target","target",{kind:"ref",target:{nodeId:dest.id,relationId:"identity"}})]};return[{id:"scene.parse.purchase",label:"创建购买事件",confidence:1,diagnostics:[],patch:{schemaVersion:1,baseRevision:graph.revision,operations:[{op:"put-node",node}]}}]}}));
  return()=>releases.reverse().forEach(release=>typeof release==="function"?release():release.dispose());}
`;

const entity = (id: string, name: string, type: "person" | "physical" | "virtual", x: number, y: number) => relationNode(id, [
  constRelation("name", "scene.predicate.name", name), refRelation("type", "scene.predicate.type", `scene.type.${type}`), constRelation("position", "scene.predicate.position", { x, y }),
]);
const event = (id: string, name: string, start: number, roles: Array<["subject" | "source" | "target" | "object", string]>) => relationNode(id, [
  constRelation("name", "scene.predicate.name", name), refRelation("type", "scene.predicate.type", "scene.type.event"), constRelation("time", "scene.predicate.time", { start }),
  ...roles.map(([role, target]) => refRelation(role, `scene.predicate.${role}`, target)),
]);

export const sceneCollectionGraph = mergeGraphs(sceneOntology, ontologyGraph([
  entity("scene.xiaoming", "小明", "person", 0.18, 0.32), entity("scene.xiaohong", "小红", "person", 0.34, 0.42),
  entity("scene.home", "小明家", "physical", 0.05, 0.82), entity("scene.xiaohong-home", "小红家", "physical", 0.32, 0.85),
  entity("scene.usdt", "100 USDT", "virtual", 0.47, 0.72), entity("scene.btc", "BTC", "virtual", 0.74, 0.54),
  entity("scene.breakfast", "早餐", "physical", 0.62, 0.9), entity("scene.chicken", "烤鸡", "physical", 0.88, 0.82),
  event("scene.deliver-breakfast", "小明去小红家送早餐", 8, [["subject", "scene.xiaoming"], ["source", "scene.home"], ["target", "scene.xiaohong-home"], ["object", "scene.breakfast"]]),
  event("scene.buy-btc", "小明用100 USDT购买BTC", 10, [["subject", "scene.xiaoming"], ["source", "scene.usdt"], ["target", "scene.btc"]]),
  event("scene.buy-chicken", "小明购买烤鸡", 18, [["subject", "scene.xiaoming"], ["source", "scene.usdt"], ["target", "scene.chicken"]]),
]));
assertRelationGraph(sceneCollectionGraph);

export async function buildScenePluginSuite() {
  const elementManifest = { ...baseElementManifest(SCENE_ELEMENT_PLUGIN_ID, "Scene Elements"), elements: [{ id: "node", tag: "scene-relation-node", purpose: "projection" as const }] };
  const elementArchive = await encodeElementPackage(elementManifest, elementSource, { "source/index.js": elementSource });
  const element = await decodeElementPackage(elementArchive);
  const nodeManifest = baseNodeTypeManifest(SCENE_NODE_PLUGIN_ID, "Scene Relation Types", SCENE_TYPES, SCENE_ELEMENT_PLUGIN_ID);
  const nodeTypeArchive = await encodeNodeTypePackage(nodeManifest, sceneOntology, nodeTypeSource, { "source/index.js": nodeTypeSource });
  const nodeType = await decodeNodeTypePackage(nodeTypeArchive);
  const collection: NodeCollectionPlugin = {
    manifest: { format: "intent-node-collection", schemaVersion: 2, id: SCENE_COLLECTION_ID, name: "小明的今天", version: "1.0.0", rootNodeIds: ["scene.deliver-breakfast", "scene.buy-btc", "scene.buy-chicken"], dependencies: { nodeTypes: [{ id: SCENE_NODE_PLUGIN_ID, version: "1.0.0" }], elements: [{ id: SCENE_ELEMENT_PLUGIN_ID, version: "1.0.0" }] } },
    graph: sceneCollectionGraph,
    workspace: { views: { mode: "tube", axes: { zRotation: 135, yLength: 200, zLength: 200 }, languageProvider: "scene.zh" }, initialSelection: ["scene.deliver-breakfast"] },
  };
  const collectionArchive = encodeCollectionPackage({ collection, nodeTypes: [nodeType], elementPlugins: [element] });
  return { elementArchive, nodeTypeArchive, collectionArchive, element, nodeType, collection };
}
