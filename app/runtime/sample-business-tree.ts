import type { IntentNode } from "./model";

export const createSampleBusinessRoot = (): IntentNode => {
  const steps = [
    {
      id: "scenario_flow",
      name: "核心业务流动场景序列与约束",
      description:
        "识别核心业务流动场景、参与者、前后置条件、主序列、异常分支与约束。",
      position: { x: 190, y: 150 },
      inputs: [
        {
          id: "product_goal",
          name: "产品目标",
          type: "string" as const,
          binding: {
            kind: "ref" as const,
            portId: "product_goal",
            env: true,
          },
        },
        {
          id: "constraints",
          name: "业务约束",
          type: "object" as const,
          binding: {
            kind: "ref" as const,
            portId: "business_constraints",
            env: true,
          },
        },
      ],
      output: {
        id: "scenario_spec",
        name: "场景序列与约束",
        type: "object" as const,
      },
      operator: "object",
    },
    {
      id: "scenario_constraints",
      name: "场景约束与业务不变量",
      description:
        "记录场景必须满足的边界、禁止条件以及跨步骤保持成立的业务事实。",
      position: { x: 450, y: 360 },
      inputs: [
        {
          id: "scenario",
          name: "场景规格",
          type: "object" as const,
          binding: {
            kind: "ref" as const,
            nodeId: "scenario_flow",
            portId: "scenario_spec",
          },
        },
      ],
      output: {
        id: "constraint_spec",
        name: "约束与不变量",
        type: "object" as const,
      },
      operator: "identity",
    },
    {
      id: "decision_boundaries",
      name: "关键决策与例外边界",
      description:
        "明确主流程中的业务判断、允许的例外以及需要由人确认的边界。",
      position: { x: 710, y: 150 },
      inputs: [
        {
          id: "consensus",
          name: "场景约束",
          type: "object" as const,
          binding: {
            kind: "ref" as const,
            nodeId: "scenario_constraints",
            portId: "constraint_spec",
          },
        },
      ],
      output: {
        id: "decision_spec",
        name: "决策与例外",
        type: "object" as const,
      },
      operator: "object",
    },
    {
      id: "success_outcomes",
      name: "成功结果与验收信号",
      description:
        "描述业务流完成后的可观察结果、失败信号以及利益相关方的验收条件。",
      position: { x: 970, y: 360 },
      inputs: [
        {
          id: "decisions",
          name: "决策边界",
          type: "object" as const,
          binding: {
            kind: "ref" as const,
            nodeId: "decision_boundaries",
            portId: "decision_spec",
          },
        },
      ],
      output: {
        id: "intent_contract",
        name: "核心业务意图契约",
        type: "object" as const,
      },
      operator: "identity",
    },
  ];

  const children = steps.map<IntentNode>((step, index) => ({
    id: step.id,
    name: step.name,
    description: step.description,
    kind: index === 0 ? "composite" : "operator",
    operator: step.operator,
    inputs: step.inputs,
    outputs: [step.output],
    children:
      index === 0
        ? [
            {
              id: "scenario_participants",
              name: "参与者与触发条件",
              description: "明确参与角色、入口和前置条件。",
              kind: "composite",
              inputs: [],
              outputs: [
                {
                  id: "participants",
                  name: "参与者模型",
                  type: "object",
                },
              ],
              children: [
                {
                  id: "scenario_actor_leaf",
                  name: "识别核心参与者",
                  description: "四层初始化叶子意图。",
                  kind: "operator",
                  operator: "object",
                  inputs: [],
                  outputs: [
                    { id: "actors", name: "参与者", type: "array" },
                  ],
                  position: { x: 280, y: 180 },
                },
              ],
              position: { x: 260, y: 170 },
            },
          ]
        : undefined,
    position: step.position,
    size: { width: 220, height: 150 },
    resizeMode: "simple",
  }));

  return {
    id: "business_root",
    name: "核心业务意图",
    description:
      "只组织业务核心流动场景、约束、关键决策与成功结果，不规定任何外树实现。",
    kind: "composite",
    inputs: [
      { id: "product_goal", name: "产品目标", type: "string" },
      { id: "business_constraints", name: "业务约束", type: "object" },
      { id: "stakeholders", name: "协作角色", type: "array" },
    ],
    outputs: [
      {
        id: "business_intent",
        name: "核心业务意图契约",
        type: "object",
        binding: {
          kind: "ref",
          nodeId: "success_outcomes",
          portId: "intent_contract",
        },
      },
    ],
    children,
    position: { x: 0, y: 0 },
    canvasSize: { width: 1400, height: 850 },
    resizeMode: "simple",
  };
};

export const businessTreeDepth = (node: IntentNode): number =>
  1 +
  Math.max(
    0,
    ...(node.children ?? []).map((child) => businessTreeDepth(child)),
  );
