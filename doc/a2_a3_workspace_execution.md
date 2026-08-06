# a2/a3 Workspace Refactor Execution Ledger

[← 返回总体方案](intent_map_position.md) · [返回项目 README](../README.md)

## Goal

本执行分支把 a2 收敛为只组织纯意图的通用节点编辑器，并把 a3 的自定义节点、
外树资源、能力运行时和 Software Authoring 实现迁移到仓库根目录 `a3/`。大型
资源采用 `intent.pip + resources/` 工作区；单文件 `.pip` 只作为默认交换
Bundle，加载后先解包再编辑。

```text
baseline: fa0cd6e
branch:   codex/a2-a3-workspace-refactor
```

## Non-negotiable boundaries

- `app/editor/` 不导入或启动 a3；a2 在没有任何 a3 时必须完整可用。
- a2 只编辑通用树关系和纯文本意图，a3 自定义数据对它不透明。
- a3 实现统一位于根目录 `a3/`，并且只能通过 a2 公共接口修改内树。
- a3 工作区向用户提供“内树”和“外树资源”两个入口；a2 只接收内树。
- `resources/` 保存 UI、DB、API、代码、图片等原始文件，支持 Git 和逐文件读写。
- PIP 容量策略由 CLI、本机 Profile 和包内配置共同决定，不使用产品级固定字节上限。
- Bundle 请求放宽本机策略时必须确认；内容 SHA 改变后授权失效。

## Checkpoints

| Phase | Deliverable | Checkpoint | Status |
|---|---|---|---|
| 0 | 稳定行为基线与执行台账 | `checkpoint/workspace-refactor-baseline` | complete |
| 1 | a2/a3 单向依赖边界 | `checkpoint/a2-a3-boundary-v1` | complete |
| 2 | a2 纯意图编辑器 | `checkpoint/a2-pure-intent-editor-v1` | complete |
| 3 | 可配置 PIP 容量策略 | `checkpoint/configurable-pip-limits-v1` | complete |
| 4 | `intent.pip + resources/` 工作区 | `checkpoint/pip-split-workspace-v1` | complete |
| 5 | 默认 Bundle 与流式读写 | `checkpoint/pip-bundle-v1` | pending |
| 6 | a3 自定义节点和投影工作区 | `checkpoint/a3-projection-workspace-v1` | pending |
| 7 | Software Authoring | `checkpoint/software-authoring-v1` | pending |
| 8 | a0–a3 自举闭环 | `checkpoint/pip-self-hosting-v1` | pending |
| 9 | 独立用户仓库 Crypto CEX 试验 | `checkpoint/crypto-cex-pilot-v1` | pending |

## Commit and rollback discipline

每个功能提交同时包含实现、定向测试和必要文档，不提交 WIP。普通提交至少通过
`npm test`；涉及 Rust、Seed 或 PIP Core 时同时通过 `npm run test:pip`。
阶段检查点另外运行 `npm run lint`、`npm run pip:dist` 和桌面/Web/CLI 冒烟
验证，并刷新受影响的系统 PIP。

已经推送的提交不 amend、不 squash、不 force-push。单功能问题使用 `git revert`
回退；阶段问题从上一 `checkpoint/*` tag 创建恢复分支。Bundle、解包缓存、用户
Registry、用户 Workspace 和大型测试资源不进入本仓库。

## Current phase

Phase 5 将在拆分工作区之上实现默认单文件 Bundle。打包与解包复用 Phase 4 的
资源索引和逐文件存储边界，并把大文件路径推进为流式读写；Bundle 只用于交换和
分发，不取代 `intent.pip + resources/` 的工作区权威副本。

Phase 4 已建立 `intent.pip + resources/` 工作区。`intent.pip` 只保存内树、资源
索引和完整性引用，UI、DB、API、代码、图片等外树内容保留为可逐文件读写和 Git
跟踪的原始资源；a2 只接收内树，不解释资源内容。Web 与原生目录适配器共享同一
惰性会话，CLI 能以不覆盖目标的方式把现有 PIP 拆成工作区。

Phase 3 已从 TypeScript 与 Rust PIP 读取路径移除固定容量常量。策略支持命令行、
本机设置和包内声明；包内声明不能自行放宽本机边界，桌面端必须确认，非交互 CLI
必须给出完整参数或显式的 `--allow-package-limits`。编辑器既能把策略保存进导出
包，也能经宿主端点或 Web 本地存储保存为本机默认。缺省值是 `ask`。

Phase 3 检查点已通过 `npm run lint`、`npm test`、`npm run test:pip`、
`npm run pip:dist` 和版本化 CLI 实包验证。macOS `.app`、系统 a0–a3 PIP、分发
清单和 SHA 构建回执已重新生成；a2 包包含本阶段的容量策略界面与本机保存入口。

Phase 4 检查点已通过相同的 lint、100 项工程测试、PIP/Rust 测试和完整 macOS
分发。默认 a3 PIP 已收录根目录 `a3/` 工作区实现源树；a2 保持不导入 a3，系统
分发仍只包含选定的 a0–a3，不包含任何用户工作区或 a4/a5 资源。

---

[← 返回总体方案](intent_map_position.md) · [返回项目 README](../README.md)
