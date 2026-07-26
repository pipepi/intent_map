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
      id: "ui_consensus",
      name: "场景匹配的 UI Demo 与流程共识",
      description:
        "基于业务场景形成可交互 UI Demo，使需求方与实现方确认业务处理流程。",
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
        id: "demo_consensus",
        name: "UI Demo 与流程共识",
        type: "object" as const,
      },
      operator: "identity",
    },
    {
      id: "database_schema",
      name: "业务流程匹配的数据库表结构",
      description:
        "根据已确认的业务流程和约束抽象实体、关系、状态与审计字段。",
      position: { x: 710, y: 150 },
      inputs: [
        {
          id: "consensus",
          name: "流程共识",
          type: "object" as const,
          binding: {
            kind: "ref" as const,
            nodeId: "ui_consensus",
            portId: "demo_consensus",
          },
        },
      ],
      output: {
        id: "schema_model",
        name: "数据库表结构",
        type: "object" as const,
      },
      operator: "object",
    },
    {
      id: "business_api",
      name: "基于表结构的业务逻辑与 UI API",
      description:
        "依据表结构实现确定性的业务处理逻辑，并输出 UI 所需 API 契约。",
      position: { x: 970, y: 360 },
      inputs: [
        {
          id: "schema",
          name: "数据库结构",
          type: "object" as const,
          binding: {
            kind: "ref" as const,
            nodeId: "database_schema",
            portId: "schema_model",
          },
        },
      ],
      output: {
        id: "api_contract",
        name: "业务逻辑与 UI API",
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
    name: "Agentic 软件开发框架",
    description:
      "从核心场景共识出发，依次形成 UI Demo、数据库表结构以及可供 UI 使用的业务 API。",
    kind: "composite",
    inputs: [
      { id: "product_goal", name: "产品目标", type: "string" },
      { id: "business_constraints", name: "业务约束", type: "object" },
      { id: "stakeholders", name: "协作角色", type: "array" },
    ],
    outputs: [
      {
        id: "delivery_blueprint",
        name: "可实施软件交付蓝图",
        type: "object",
        mapping: {
          kind: "ref",
          nodeId: "business_api",
          portId: "api_contract",
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
