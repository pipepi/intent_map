# a2/a3 Workspace Refactor Execution Ledger

[← 返回总体方案](intent_map_position.md) · [返回项目 README](../README.md)

## Goal

本执行分支把 a2 收敛为只组织纯意图的通用节点编辑器基础设施，并把 a3 的自定义节点、
外树资源、能力运行时和 Software Authoring 实现迁移到仓库根目录 `a3/`。大型
资源采用 `intent.pip + resources/` 工作区；单文件 `.pip` 只作为默认交换
Bundle，加载后先解包再编辑。

```text
baseline: fa0cd6e
branch:   codex/a2-a3-workspace-refactor
```

## Non-negotiable boundaries

- `app/editor/` 不导入或启动 a3；a2 在没有任何 a3 时必须完整可用。
- 软件复杂度掌控属于 a3 Software Authoring 的节点预制件和模板地图，不属于 a2。
- 人工开发是完整的一等路径；Agent 与 MCP 只能作为可选操作者和适配层。
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
| 5 | 默认 Bundle 与流式读写 | `checkpoint/pip-bundle-v1` | complete |
| 6 | a3 自定义节点和投影工作区 | `checkpoint/a3-projection-workspace-v1` | complete |
| 7 | Software Authoring | `checkpoint/software-authoring-v1` | complete |
| 8 | a0–a3 自举闭环 | `checkpoint/pip-self-hosting-v1` | complete |
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

Phase 8 已完成 a0–a3 自举闭环。系统 source PIP 可以被稳定审计并重建为普通源码；
编辑后必须 seal 候选源码，隔离构建会产生四个确定性候选和工具链/来源 receipt，
promote 重新验证完整候选集合后才以非覆盖方式写入系统 Registry。任何阶段都不允许
运行中的包原地覆盖自身。

Phase 9 将在独立用户仓库试验 Crypto CEX。该仓库属于用户 a4 数据，不进入本仓库
系统默认包或官方分发；开始前需要确定独立仓库位置和用户 Registry/Workspace 边界。

Phase 7 已实现 Software Authoring v1。三种纯内树 custom-node 表达目标、业务流
场景和业务约束；Worker 只执行声明命令并提供结构诊断，不判断业务正确性。首个
`software-specification/1` 外树投影把单个节点规划为 Markdown proposal，经过
Host 校验后写入拆分工作区，并提供端到端 CLI。

Phase 6 已建立 a3 custom-node v1、显式类型/能力 Registry、带 extension SHA 的
原子意图补丁、投影来源身份和乐观一致性诊断。投影工作区惰性读取外树资源，支持
显式附加、手工修正、非破坏 detach 和需要确认的 reset；只读 CLI 可输出稳定
JSON，供终端、未来 UI 和 MCP 共用。

Phase 5 已完成可逆 Bundle。Node/CLI 和 Web File System Access 路径都逐块读取、
写入并计算 SHA-256；打包结果与标准 PIP 编码逐字节一致，解包恢复小型
`intent.pip + resources/` 权威工作区。CLI 提供不覆盖目标的 `bundle` 与
`unbundle` 命令，Web 使用用户授权的文件和空目录句柄。连续 a2 构建也通过基于
release 配置的稳定 Build ID 得到相同 SHA。

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

Phase 5 检查点已通过 lint、110 项工程测试、8 项 TypeScript PIP 测试、13 项
Rust Core 测试、Seed/Tauri 编译与完整 macOS 分发。系统 a2 与 a3 权威 PIP 已
刷新，分发清单仍只有系统 a0–a3；大型测试资源只在临时目录生成，不进入 Git。

Phase 6 检查点已通过 lint、129 项工程测试、8 项 TypeScript PIP 测试、13 项
Rust Core 测试、Seed/Tauri 编译与完整 macOS 分发。a2 编辑器仍不导入或启动
a3；官方分发仍只包含系统 a0–a3，不包含用户 a4/a5 或用户工作区。

Phase 7 检查点已通过 lint、145 项工程测试、8 项 TypeScript PIP 测试、13 项
Rust Core 测试、Seed/Tauri 编译与完整 macOS 分发。a2 构建保持确定性，系统 a3
PIP 包含 Worker 与 Software Authoring 源码；默认分发仍没有任何 a4/a5 数据。

Phase 8 已实现源码边界审计、非覆盖重建、编辑后 seal、隔离确定性候选构建和
receipt-gated promote。候选构建运行重建源码内的脚本，复用 lockfile 对应工具链；
同一封存源码重复构建得到相同四包 receipt，篡改和未封存漂移都会失败。

Phase 8 检查点已通过 lint、152 项工程测试、8 项 TypeScript PIP 测试、13 项
Rust Core 测试、Seed CLI、Tauri 编译和完整 macOS `.app` 分发。源码审计为 clean，
分发清单只包含系统 a0–a3，不包含 a4/a5、用户 Registry 或用户 Workspace。

---

[← 返回总体方案](intent_map_position.md) · [返回项目 README](../README.md)
