# Software Authoring：软件开发复杂度掌控

[← 上一篇：Intent Map](intent_map.md) · [返回总体方案](../intent_map_position.md) · [下一篇：Crypto CEX →](crypto_cex.md)

Software Authoring 的 UI、DB、API 和代码等原始产物使用
[Split Workspace](split_workspace.md) 保存在 `resources/`；`intent.pip` 只保存内树
与资源完整性索引。
[a3 Projection Workspace](a3_projection_workspace.md) 定义 custom-node、来源身份、
手工修正和可重建外树的通用边界。

## 定位

Software Authoring 是默认系统 a3 之一。它不是独立编辑器，而是加载到 a2 公共
扩展边界中的节点预制件与预设模板地图：通过 `software-authoring/1` 描述软件需求、
业务核心流、约束、外树投影、实现、发布和反馈。a3 是可组合的业务无关扩展类别，
不限于 Software Authoring；其他领域可以提供自己的节点类型、模板、规则和命令。

它不属于 Intent Map 内核，也不依赖 Agent。其核心价值是把软件生产与反馈过程变成
可视化、可逐层披露的节点地图，通过分形边界和局部填充让人获得对软件开发复杂度
的掌控力。

```text
a2 Intent Map：通用节点编辑器基础设施
        +
a3 Software Authoring：软件节点预制件 + 预设模板地图
        =
可视化的软件生产与复杂度掌控工作台
```

## 核心策略

> 在合适颗粒度的树枝上达成共识，建立掌控边界；每次只填充一个人能够理解、修改、接管或推倒重来的小范围。

```text
观察整体轮廓
→ 选择树枝
→ 聚焦到合适颗粒度
→ 达成局部共识
→ 手工、协作或借助工具填充
→ 回到整体观察
→ 局部修正或重来
```

掌控不等于保证业务正确。系统允许非常规、不完整或表面矛盾的选择，只需要让用户清楚当前意图、边界和结果，并保留修改与接管能力。

## 内树

内树保存实现无关的业务核心物流动场景和约束，包括：

- 业务目标与参与者；
- 输入、输出和状态流动；
- 前置条件和结果；
- 正常场景和异常分支；
- 业务约束与人工决策点；
- 已形成共识的局部边界。

内树不要求包含 UI、数据库、API、框架或部署平台。没有任何外树时，内树仍然是独立有效的产物。

Software Authoring v1 使用三种 a3 custom-node 表达这一层：

- `software-intent-goal/1`：目标和可选深层目标；
- `business-flow-scenario/1`：场景、触发、结果和约束；
- `business-constraint/1`：约束陈述和可选理由。

这些节点只校验结构是否可理解，不判断业务选择是否正确。刻意矛盾、非常规或为了
深层目标而“不正确”的内容仍可保存。a2 只原样往返统一扩展信封，不解释这些类型。

## a3 节点插件模型

a3 不通过新增工作区 Surface 进入 a2。它更接近 Blender、ComfyUI 的第三方节点
插件：a2 保持同一个通用画布和属性编辑器，已加载的 a3 PIP 向运行时 Registry
注册节点预制件。用户点击“添加业务节点”时，在 a2 内置通用节点之外选择这些
预制件。

```text
a2 通用节点编辑器
└── 添加业务节点
    ├── a2：通用容器、通用操作
    └── a3 Software Authoring
        ├── Software Intent Goal
        ├── Business Flow Scenario
        └── Business Constraint
```

a3 PIP 提供节点类型 ID、名称、分类、默认实例数据、声明式属性字段、结构校验以及
可选命令和投影能力。a2 负责节点 ID、位置、层级、连接、选择、通用卡片渲染和
属性表单，不允许 a3 直接注入 React 或改写整个文档。选择预制件后仍创建普通
`IntentNode`，a3 专有部分只保存在不透明 extension 中。

```text
IntentNode（a2 所有）
├── id / name / description / children / ports / position
└── extension（a2 只校验并完整往返）
    └── kind / capability / settings（a3 解释）
```

因此 a4 业务 PIP 保存的是“使用了哪个插件节点及其实例参数”，类似 ComfyUI
workflow 保存节点类型和配置；它不复制 a3 PIP 的节点定义、Worker 或实现代码。
a3 PIP 是可独立替换和加载的插件包，a4 PIP 是使用这些插件节点组成的业务工程。

缺少对应 a3 时，a2 仍显示节点名称、描述、层级和通用端口，并原样保留 extension；
节点标记为“插件未加载”，不能编辑 a3 专有字段或执行相关命令，但仍可移动、连接、
删除和继续编辑纯意图。重新加载匹配 a3 后，声明式属性和能力恢复，不需要迁移 a4。

加载流程应保持单向边界：Runtime Host 校验 a3 PIP、容量策略、SHA 和信任状态，
在隔离 Worker 中启动能力，再把声明式预制件 Registry 提供给 a2。a2 本身不导入
或启动 a3 源码。插件启用与状态可以放在全局设置中，但不是新的业务工作区 Surface。

当前实现已经具备 `pip-capability/1` descriptor、三种 `customNodeKinds`、隔离
Worker 和不透明 extension 往返；尚未完成的是把 a3 Host 挂接到应用组合根、把
预制件 Registry 接入“添加业务节点”，以及在属性编辑器中渲染 a3 声明式字段。
在这条最小界面闭环完成前，导入 a3 PIP 只会把它当普通文档显示，不能启用节点插件。

## 可选外树

UI、DB Tables、API 和代码等是内树的可选投影：

```text
内树
├── 0..N 个 UI 投影
├── 0..N 个 DB Tables 投影
├── 0..N 个 API 投影
├── 0..N 个代码投影
└── 0..N 个其他投影
```

外树可以不存在、局部生成、拥有多个候选版本，也可以被删除、手工修改或重新生成。系统不要求所有外树永久一致；发现偏差时，支持乐观地局部修正或推倒重来。

当前第一个可执行投影是 `software-specification/1`：能力 Worker 把单个目标、场景
或约束规划成小型 Markdown proposal，a3 Host 校验来源、能力、路径、所有权和
手工内容保护后才写入 `resources/docs/`。该投影证明完整边界，不代表 UI、DB、
API 或代码已经实现。

```bash
npm run pip:software:spec -- ./my-workspace <node-id> --allow-package-limits
npm run pip:projection:audit -- ./my-workspace --allow-package-limits
```

重新生成不会自动删除旧文件；不再被引用的文件作为 orphan 保留。覆盖 `manual`
或 `mixed` 投影需要显式 `--allow-manual-overwrite`。

## 八层渐进式披露

| 层级 | 含义 | 典型内容 |
|---|---|---|
| 第一层：聊天 | 探索空间 | 意图、追问、协商、候选方案 |
| 第二层：内树 | 掌控核心 | 业务核心物流动场景与约束 |
| 第三层：交互与契约 | 可选外树 | UI、DB Tables、API |
| 第四层：后端代码 | 可选实现 | 业务逻辑、数据访问、测试 |
| 第五层：前端代码 | 可选实现 | 页面、组件、状态和交互 |
| 第六层：外围系统 | 现实环境 | 身份、支付、消息和基础设施 |
| 第七层：分发 | 抵达用户 | 构建、部署、渠道和升级 |
| 第八层：分利润 | 价值闭环 | 收费、成本、结算和分成 |

这些层不是必须依次完成的流水线。用户始终立足第二层，按需披露、跳过或停止在任何层。

## 实现方式

Software Authoring 服务的是软件生产方式，而不是某一种自动编程方式。传统人工
流程可以完整使用它：梳理需求内树，设计 UI，设计 Tables 与 API，分别完成后端和
前端，实现外围系统，发布和推广，再记录反馈与收益分配。每一步的实施者都可以是
个人、团队或既有工具。

每个局部都可以选择：

- 完全手工实现；
- 团队协作实现；
- 使用脚本、模板或普通工具；
- 人先写、Agent 补全；
- Agent 先写、人接管；
- 完全委托 Agent；
- 挂接已有外部实现。

Agent 只是上述实施者中的可选项。Agent 参与时，单次任务应绑定到明确树枝、目标层、
允许范围和完整的局部上下文；PIP MCP Server 可以提供节点读取、编辑、填充、导入
和导出工具，但只是可选适配层。移除 Agent 后，节点模型、模板、人工流程和产物仍然
完整成立。

## 与 Intent Map 的边界

[Intent Map](intent_map.md) 提供通用节点编辑基础设施；Software Authoring 以 a3
节点预制件、模板地图和规则提供内树、外树、八层披露和软件创作方法。

```text
Intent Map：怎样编辑任意节点地图
Software Authoring：提供哪些软件创作节点和模板，以及怎样用它们掌控复杂度
```

用户 Runtime Profile 指定的 a3 提供者优先于系统默认。一个能力 ABI 只能有
一个主提供者；不同能力可以由多个隔离 Worker 同时提供。缺失或崩溃的能力只会
移除对应节点预制件、专有属性和命令，不影响已有实例的数据保留与基础节点编辑。

[查看多编辑器、多能力和用户版本选择规则 →](pip_runtime_profiles.md)

Software Authoring 的构建、测试与发布边界已用于验证系统自身：a0–a3 source PIP
能够恢复普通源码，编辑后以 receipt 封存，在隔离目录生成候选，再经显式 promote
进入下一版本系统 Registry。参见 [PIP Self-Hosting](pip_self_hosting.md)。

## 实现映射

该文档应对应：

- 内树和外树的业务节点定义；
- 八层视角和逐层披露行为；
- 局部任务边界与产物挂载；
- 人工、团队和自动化操作入口；
- 可选 PIP MCP Server；
- `software_authoring.pip` 的构建与分发。

当前代码映射：

- `a3/extensions/software-authoring/custom-nodes.ts`：纯内树节点结构；
- `a3/extensions/software-authoring/capability.mjs`：隔离 Worker 描述、诊断和 proposal；
- `a3/core/pip-capabilities.ts`：插件 descriptor、能力解析和隔离 Worker；
- `a3/host/use-pip-capability-session.ts`：待接入应用组合根的 a3 Host 会话；
- `a3/projection/projection-proposals.ts`：Provider 输出的 Host 校验边界；
- `scripts/project-software-specification.mjs`：系统默认能力的端到端 CLI。

## 验收条件

- 不使用 Agent 也能完成内树和外树编辑；
- 只有内树时应用仍然成立；
- 用户可以只披露任意一种外树；
- 大树枝可以继续细分到可理解范围；
- 外树可以手工修正或局部重来；
- 同一工作可以在人、Agent和其他工具间接管；
- 已加载的 a3 节点预制件出现在 a2 的统一“添加业务节点”选择器中；
- 缺少 a3 时已有插件节点以通用意图降级显示且不丢失实例数据；
- 能作为独立 `.pip` 被 Intent Map 打开和编辑。

---

[← 上一篇：Intent Map](intent_map.md) · [PIP Self-Hosting](pip_self_hosting.md) · [a3 Projection Workspace](a3_projection_workspace.md) · [返回总体方案](../intent_map_position.md) · [下一篇：Crypto CEX →](crypto_cex.md)
