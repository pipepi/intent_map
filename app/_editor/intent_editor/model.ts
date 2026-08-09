export type NodeId = string;
export type NodeKind = "physical" | "person" | "virtual" | "event";
export type ViewMode = "quadrant" | "tube";

export type SurfacePosition = {
  sector: number;
  depth: number;
};

export type TimeSpan = {
  start: number;
  end?: number;
};

export type NodeRelation = {
  type: "subject" | "source" | "target" | "object";
  targetId: NodeId;
};

export type SceneNode = {
  tag: {
    id: NodeId;
    name: string;
    kind: NodeKind;
    position?: SurfacePosition;
    time?: TimeSpan;
  };
  relations: NodeRelation[];
};

export type SceneState = {
  nodes: Record<NodeId, SceneNode>;
};

function sampleEvent(
  id: NodeId,
  name: string,
  start: number,
  end: number,
  links: Array<[NodeRelation["type"], NodeId]>,
): SceneNode {
  return {
    tag: { id, name, kind: "event", time: { start, end } },
    relations: links.map(([type, targetId]) => ({ type, targetId })),
  };
}

const extraEvents = Object.fromEntries([
  sampleEvent("receive-breakfast", "小红在家收到早餐", 8.6, 8.75, [["subject", "xiaohong"], ["source", "xiaohong-home"], ["object", "breakfast"]]),
  sampleEvent("return-home", "小明从小红家返回家中", 9, 9.4, [["subject", "xiaoming"], ["source", "xiaohong-home"], ["target", "home"]]),
  sampleEvent("check-usdt", "小明查看 USDT 余额", 9.55, 9.7, [["subject", "xiaoming"], ["object", "usdt"]]),
  sampleEvent("btc-rise", "BTC 价格上涨", 11.2, 11.5, [["subject", "btc"]]),
  sampleEvent("transfer-usdt", "小红向小明转账 USDT", 12, 12.3, [["subject", "xiaohong"], ["target", "xiaoming"], ["object", "usdt"]]),
  sampleEvent("rest-at-home", "小明在家休息", 13.1, 13.8, [["subject", "xiaoming"], ["target", "home"]]),
  sampleEvent("check-btc", "小明查看 BTC", 15, 15.2, [["subject", "xiaoming"], ["object", "btc"]]),
  sampleEvent("xiaohong-return-home", "小红回到家中", 16.1, 16.45, [["subject", "xiaohong"], ["target", "xiaohong-home"]]),
  sampleEvent("take-chicken-home", "小明把烤鸡带回家", 19, 19.35, [["subject", "xiaoming"], ["object", "chicken"], ["target", "home"]]),
  sampleEvent("review-breakfast", "小红评价早餐", 19.7, 20, [["subject", "xiaohong"], ["object", "breakfast"]]),
].map((node) => [node.tag.id, node])) as Record<NodeId, SceneNode>;

export const todayScene: SceneState = {
  nodes: {
    xiaoming: {
      tag: {
        id: "xiaoming",
        name: "小明",
        kind: "person",
        position: { sector: 0.18, depth: 0.32 },
      },
      relations: [],
    },
    xiaohong: {
      tag: {
        id: "xiaohong",
        name: "小红",
        kind: "person",
        position: { sector: 0.34, depth: 0.42 },
      },
      relations: [],
    },
    usdt: {
      tag: {
        id: "usdt",
        name: "USDT",
        kind: "virtual",
        position: { sector: 0.47, depth: 0.72 },
      },
      relations: [],
    },
    btc: {
      tag: {
        id: "btc",
        name: "BTC",
        kind: "virtual",
        position: { sector: 0.74, depth: 0.54 },
      },
      relations: [],
    },
    chicken: {
      tag: {
        id: "chicken",
        name: "烤鸡",
        kind: "physical",
        position: { sector: 0.88, depth: 0.82 },
      },
      relations: [],
    },
    home: {
      tag: {
        id: "home",
        name: "小明家",
        kind: "physical",
        position: { sector: 0.05, depth: 0.82 },
      },
      relations: [{ type: "subject", targetId: "xiaoming" }],
    },
    "xiaohong-home": {
      tag: {
        id: "xiaohong-home",
        name: "小红家",
        kind: "physical",
        position: { sector: 0.32, depth: 0.85 },
      },
      relations: [{ type: "subject", targetId: "xiaohong" }],
    },
    breakfast: {
      tag: {
        id: "breakfast",
        name: "早餐",
        kind: "physical",
        position: { sector: 0.62, depth: 0.9 },
      },
      relations: [],
    },
    "deliver-breakfast": {
      tag: {
        id: "deliver-breakfast",
        name: "从家跑到小红家送早餐",
        kind: "event",
        time: { start: 8, end: 8.5 },
      },
      relations: [
        { type: "subject", targetId: "xiaoming" },
        { type: "source", targetId: "home" },
        { type: "target", targetId: "xiaohong-home" },
        { type: "target", targetId: "xiaohong" },
        { type: "object", targetId: "breakfast" },
      ],
    },
    "buy-btc": {
      tag: {
        id: "buy-btc",
        name: "用 100 USDT 购买 BTC",
        kind: "event",
        time: { start: 10, end: 10.6 },
      },
      relations: [
        { type: "subject", targetId: "xiaoming" },
        { type: "source", targetId: "usdt" },
        { type: "target", targetId: "btc" },
      ],
    },
    "buy-chicken": {
      tag: {
        id: "buy-chicken",
        name: "用剩余 10 USDT 购买一只烤鸡",
        kind: "event",
        time: { start: 18, end: 18.35 },
      },
      relations: [
        { type: "subject", targetId: "xiaoming" },
        { type: "source", targetId: "usdt" },
        { type: "target", targetId: "chicken" },
      ],
    },
    ...extraEvents,
  },
};

export const relationNames: Record<NodeRelation["type"], string> = {
  subject: "主体",
  source: "来源",
  target: "目标",
  object: "对象",
};

export const kindNames: Record<Exclude<NodeKind, "event">, string> = {
  person: "人物",
  virtual: "虚拟物",
  physical: "实物",
};

export const kindColors: Record<Exclude<NodeKind, "event">, string> = {
  physical: "#ffb45e",
  person: "#7c9cff",
  virtual: "#b88cff",
};
