import type { Pip } from "../../pip-editor/pip/index.ts";
import { assertPipGraph } from "../../pip-editor/pip/index.ts";
import { constPip, mergeGraphs, ontologyGraph, refPip, pipNode } from "../shared/pip-builders.ts";
import { pipProjectionOntology } from "../pip-projections/domain.ts";
import { buildProjectionBundle } from "./projection-bundle.ts";

export const SCENE_ELEMENT_PLUGIN_ID = "official.scene-elements";
export const SCENE_NODE_PLUGIN_ID = "official.scene-types";
export const SCENE_NODE_MAP_ID = "official.today-scene";
export const SCENE_TYPE_NAMES = ["scene", "person", "physical", "virtual", "event"] as const;
export const SCENE_TYPES = SCENE_TYPE_NAMES.map((kind) => `scene.type.${kind}`);
export const SCENE_PREDICATES = [
  "name", "type", "position", "time", "subject", "source", "target", "object",
  "contains", "observes", "projection", "camera",
] as const;

const predicates = SCENE_PREDICATES.map((name) => pipNode(`scene.predicate.${name}`));
const types = SCENE_TYPES.map((id) => pipNode(id, [refPip("type", "pip.core.type", "pip.core.type")]));
const projections = [pipNode("scene.projection.quadrant"), pipNode("scene.projection.tube")];
export const sceneOntology = ontologyGraph([...predicates, ...types, ...projections]);

const entity = (id: string, name: string, type: "person" | "physical" | "virtual", sector: number, depth: number, extra: Pip[] = []) => pipNode(id, [
  constPip("name", "scene.predicate.name", name),
  refPip("type", "scene.predicate.type", `scene.type.${type}`),
  constPip("position", "scene.predicate.position", { sector, depth, manual: false }), ...extra,
]);
const event = (id: string, name: string, start: number, end: number, roles: Array<["subject" | "source" | "target" | "object", string]>) => pipNode(id, [
  constPip("name", "scene.predicate.name", name), refPip("type", "scene.predicate.type", "scene.type.event"),
  constPip("time", "scene.predicate.time", { start, end }),
  ...roles.map(([role, target], index) => refPip(`${role}:${index}`, `scene.predicate.${role}`, target)),
]);

const businessNodes = [
  entity("scene.xiaoming", "小明", "person", 0.18, 0.32), entity("scene.xiaohong", "小红", "person", 0.34, 0.42),
  entity("scene.usdt", "USDT", "virtual", 0.47, 0.72), entity("scene.btc", "BTC", "virtual", 0.74, 0.54),
  entity("scene.chicken", "烤鸡", "physical", 0.88, 0.82),
  entity("scene.home", "小明家", "physical", 0.05, 0.82, [refPip("subject:0", "scene.predicate.subject", "scene.xiaoming")]),
  entity("scene.xiaohong-home", "小红家", "physical", 0.32, 0.85, [refPip("subject:0", "scene.predicate.subject", "scene.xiaohong")]),
  entity("scene.breakfast", "早餐", "physical", 0.62, 0.9),
  event("scene.deliver-breakfast", "从家跑到小红家送早餐", 8, 8.5, [["subject", "scene.xiaoming"], ["source", "scene.home"], ["target", "scene.xiaohong-home"], ["target", "scene.xiaohong"], ["object", "scene.breakfast"]]),
  event("scene.receive-breakfast", "小红在家收到早餐", 8.6, 8.75, [["subject", "scene.xiaohong"], ["source", "scene.xiaohong-home"], ["object", "scene.breakfast"]]),
  event("scene.return-home", "小明从小红家返回家中", 9, 9.4, [["subject", "scene.xiaoming"], ["source", "scene.xiaohong-home"], ["target", "scene.home"]]),
  event("scene.check-usdt", "小明查看 USDT 余额", 9.55, 9.7, [["subject", "scene.xiaoming"], ["object", "scene.usdt"]]),
  event("scene.buy-btc", "用 100 USDT 购买 BTC", 10, 10.6, [["subject", "scene.xiaoming"], ["source", "scene.usdt"], ["target", "scene.btc"]]),
  event("scene.btc-rise", "BTC 价格上涨", 11.2, 11.5, [["subject", "scene.btc"]]),
  event("scene.transfer-usdt", "小红向小明转账 USDT", 12, 12.3, [["subject", "scene.xiaohong"], ["target", "scene.xiaoming"], ["object", "scene.usdt"]]),
  event("scene.rest-at-home", "小明在家休息", 13.1, 13.8, [["subject", "scene.xiaoming"], ["target", "scene.home"]]),
  event("scene.check-btc", "小明查看 BTC", 15, 15.2, [["subject", "scene.xiaoming"], ["object", "scene.btc"]]),
  event("scene.xiaohong-return-home", "小红回到家中", 16.1, 16.45, [["subject", "scene.xiaohong"], ["target", "scene.xiaohong-home"]]),
  event("scene.buy-chicken", "用剩余 10 USDT 购买一只烤鸡", 18, 18.35, [["subject", "scene.xiaoming"], ["source", "scene.usdt"], ["target", "scene.chicken"]]),
  event("scene.take-chicken-home", "小明把烤鸡带回家", 19, 19.35, [["subject", "scene.xiaoming"], ["object", "scene.chicken"], ["target", "scene.home"]]),
  event("scene.review-breakfast", "小红评价早餐", 19.7, 20, [["subject", "scene.xiaohong"], ["object", "scene.breakfast"]]),
];
export const SCENE_BUSINESS_IDS = businessNodes.map(({ id }) => id);
const sceneRoot = pipNode("scene.today", [
  constPip("name", "scene.predicate.name", "小明的今天"), refPip("type", "scene.predicate.type", "scene.type.scene"),
  ...SCENE_BUSINESS_IDS.map((id, index) => refPip(`contains:${index}`, "scene.predicate.contains", id)),
]);
const projectionBundle = buildProjectionBundle([sceneRoot, ...businessNodes], "scene.predicate.contains");

export const sceneNodeMapGraph = mergeGraphs(pipProjectionOntology, sceneOntology, ontologyGraph([...businessNodes, sceneRoot, ...projectionBundle.nodes]));
assertPipGraph(sceneNodeMapGraph);

export const sceneNodeMapData = {
  graph: sceneNodeMapGraph,
  workspace: { views: {
    kind: "free-layout", world: { width: 2600, height: 1600 }, camera: { scale: 1, x: 0, y: 0 },
    projections: {}, systemWindows: {},
  }, initialSelection: [] },
};
