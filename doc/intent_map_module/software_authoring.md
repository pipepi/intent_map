# Software Authoring：软件开发复杂度掌控

[← 上一篇：Intent Map](intent_map.md) · [返回总体方案](../intent_map_position.md) · [下一篇：Crypto CEX →](crypto_cex.md)

Software Authoring 的 UI、DB、API 和代码等原始产物使用
[Split Workspace](split_workspace.md) 保存在 `resources/`；`intent.pip` 只保存内树
与资源完整性索引。
[a3 Projection Workspace](a3_projection_workspace.md) 定义 custom-node、来源身份、
手工修正和可重建外树的通用边界。

## 定位

Software Authoring 是默认系统 a3 之一，通过 `software-authoring/1` 提供源码、
构建、测试和发布能力。a3 是可组合的业务无关能力类别，不限于 Software
Authoring；数据库设计、API 设计、Bevy 画布和测试生成都可以由不同 a3 提供。

它不属于 Intent Map 内核，也不依赖 Agent。其核心价值是通过分形边界、逐层披露和局部填充，让人获得对软件开发复杂度的掌控力。

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

每个局部都可以选择：

- 完全手工实现；
- 团队协作实现；
- 使用脚本、模板或普通工具；
- 人先写、Agent 补全；
- Agent 先写、人接管；
- 完全委托 Agent；
- 挂接已有外部实现。

当 Agent 参与时，单次任务应绑定到明确树枝、目标层、允许范围和少量输出。PIP MCP Server 可以提供节点读取、编辑、填充、导入和导出工具，但只是可选适配层。

## 与 Intent Map 的边界

[Intent Map](intent_map.md) 提供通用节点和画布能力；Software Authoring 提供内树、外树、八层披露和软件创作方法。

```text
Intent Map：怎样编辑节点应用
Software Authoring：怎样用节点掌控软件开发复杂度
```

用户 Runtime Profile 指定的 a3 提供者优先于系统默认。一个能力 ABI 只能有
一个主提供者；不同能力可以由多个隔离 Worker 同时提供。缺失或崩溃的能力
只禁用相关编辑面，不影响基础节点编辑。

[查看多编辑器、多能力和用户版本选择规则 →](pip_runtime_profiles.md)

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
- `a3/projection/projection-proposals.ts`：Provider 输出的 Host 校验边界；
- `scripts/project-software-specification.mjs`：系统默认能力的端到端 CLI。

## 验收条件

- 不使用 Agent 也能完成内树和外树编辑；
- 只有内树时应用仍然成立；
- 用户可以只披露任意一种外树；
- 大树枝可以继续细分到可理解范围；
- 外树可以手工修正或局部重来；
- 同一工作可以在人、Agent和其他工具间接管；
- 能作为独立 `.pip` 被 Intent Map 打开和编辑。

---

[← 上一篇：Intent Map](intent_map.md) · [a3 Projection Workspace](a3_projection_workspace.md) · [返回总体方案](../intent_map_position.md) · [下一篇：Crypto CEX →](crypto_cex.md)
