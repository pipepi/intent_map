# a3 Custom Node 与可选投影工作区

[← 返回项目 README](../../README.md) · [Intent Map](intent_map.md) · [Split Workspace](split_workspace.md) · [Software Authoring](software_authoring.md) · [返回总体方案](../intent_map_position.md)

## 定位

a3 通过 a2 节点上的不透明扩展信封表达业务无关能力，只与第二层内树建立关系。
UI、DB、API、代码和图片等外树内容不进入 a2 模型，而是作为拆分工作区中的普通
资源存在。投影可以缺失、过期、断链、手工修改或重新生成；系统诊断不一致，但不
以“外树必须始终正确”为前提阻止用户继续工作。

```text
a2 IntentNode
└── extension（a2 只校验通用信封）
    └── intent-map.a3.custom-node / v1
        ├── kind: software-flow/1
        ├── capability: software-authoring/1
        └── settings: JSON

同一内树节点
└── 0..N 个可选投影
    └── resources/ 中的普通文件
```

## Custom Node 边界

a3 custom node 使用统一 namespace 和 schema version。`kind` 与 `capability` 都
是带版本的 ABI 标识；具体提供者由 a3 Registry 显式注册。a2 不认识这些字段，
只负责完整往返扩展数据。

a3 修改内树时不能直接改写整棵树，而是提交排序、去重的小范围补丁。v1 补丁只
允许设置或清除 a3 自己的 extension：

- 每个操作携带旧 extension SHA-256，拒绝陈旧并发写入；
- 不能覆盖其他 namespace；
- 不能改节点名称、关系、端口、布局或其他 a2 字段；
- 一批操作在副本上执行，任一失败都不改变输入树。

## 投影索引

投影元数据保存为普通工作区资源：

```text
resources/a3/projections/index.json
```

每项包含稳定 `projectionId`、版本化投影类型、来源节点、来源 SHA、提供能力、
物化状态和资源路径。路径与 projectionId 确定性排序；一个资源只能由一个投影
拥有，避免自动化工具互相覆盖。

物化状态：

| 状态 | 含义 |
|---|---|
| `generated` | 当前内容由能力生成 |
| `manual` | 当前内容由用户手工维护 |
| `mixed` | 生成内容已经被手工修改 |

来源 SHA 变化只产生 `stale-source` 警告。来源节点丢失、能力错配、资源缺失和
所有权冲突产生可见错误诊断，但索引仍可打开，以便用户手工修正或选择重生成。

## 工作区行为

- 打开时只读取小型投影索引；
- 审计只使用内树和资源元数据，不下载资源正文；
- 聚焦某个投影文件时才读取并校验该文件；
- 写入新路径必须显式附加到 projection；
- 跨 projection 抢占资源会被拒绝；
- 手工修改生成资源会把状态改为 `mixed`；
- detach 只解除索引关联，不删除用户文件；
- reset `manual` 或 `mixed` 内容前必须显式确认。

只读审计入口：

```bash
npm run pip:projection:audit -- ./my-workspace --allow-package-limits
```

输出稳定 JSON，可由终端、未来的 a3 工作区 UI 或 PIP MCP Server 共用。该命令
不修改工作区。

## 实现映射

- `a3/core/custom-nodes.ts`：custom-node v1 信封与 Registry；
- `a3/core/custom-node-patches.ts`：受控、带 SHA 的原子意图补丁；
- `a3/projection/projection-index.ts`：投影身份、来源 SHA 与诊断；
- `a3/projection/projection-workspace.ts`：惰性读取和显式资源操作；
- `scripts/audit-pip-projections.mjs`：只读 CLI 审计入口。

---

[← 返回项目 README](../../README.md) · [Intent Map](intent_map.md) · [Split Workspace](split_workspace.md) · [Software Authoring](software_authoring.md) · [返回总体方案](../intent_map_position.md)
