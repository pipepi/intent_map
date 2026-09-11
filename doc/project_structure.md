# 工程目录、处理机制与层级结构

[项目首页](../README.md) · [PIP Seed](pip-seed/seed.md) ·
[A3–A5 插件架构](pip_node_plugins.md) ·
[Pip Host](../pip-editor/pip-host/README.md)

## 1. 总体模型

工程不是传统的“前端 + 后端”分层，而是两套结构叠加：

1. PIP 启动层级解决谁加载谁，以及每层能够提供什么能力。
2. 编辑器处理层级解决 Pip 数据如何修改、投影和呈现。

```text
操作系统
  ↓
A0 Seed → A1 Loader → A2 Pip Editor
                           ↓
                    A3 Element
                    A4 Node Type
                    A5 Node Map
```

编辑器内部则是：

```text
PipDocument / PIP
  ↓
PipGraph
  ↓ PipTx
WorkspaceSession
  ↓ A4 Projection
A3 Element
  ↓
WorkspaceWindow / Tab / Embedded Surface
```

## 2. 顶层目录

```text
pip_intent/
├── pip-seed/            A0/A1 原生启动、加载与系统包仓库
├── pip-editor/          A2 通用 Pip 编辑器
├── pip-editor-io/       可安装的领域 A3/A4/A5 插件源码
├── scripts/             构建、验证、自宿主和发布机制
├── tests/               跨层契约、行为与静态边界测试
├── doc/                 架构、协议和演进文档
├── dist/                分发构建产物，不是权威源码
└── out/                 Web 静态构建中间产物
```

`pip-editor-io` 不是通用文件 I/O 层；它保存 Intent、Scene、Spot Terminal 等
领域插件套件。核心模型属于 `pip-editor/pip`，通用 PIP 编解码和文件工作区能力属于 `pip-editor/pip-package`，随 A2 编译
的宿主特权插件属于 `pip-editor/pip-host-io`。

## 3. PIP 六层协议

| 层 | 主要目录 | 负责 | 不负责 |
| --- | --- | --- | --- |
| A0 Seed | `pip-seed/runtime`、`cli`、`tauri` | 原生发现、验证并启动 A1 | 编辑业务节点 |
| A1 Loader | `pip-seed/loader` | 选择 A2、版本与恢复入口 | 通用 Pip 编辑 |
| A2 Editor | `pip-editor` | PIP I/O、工作区、事务、投影和宿主 | 猜测领域语义 |
| A3 Element | `pip-editor-io/*/elements` | Web Component 表现与交互 | 决定 Pip 合法性 |
| A4 Node Type | `pip-editor-io/*/runtime`、`suite.ts` | 类型、命令、验证、Creator、Projection、Executor | 保存业务实例 |
| A5 Node Map | 插件 suite 构建产物 | Graph、roots、views 和精确 A4 依赖 | 执行代码 |

依赖方向固定为：

```text
A5 Node Map
  └── 精确依赖 A4 Node Type
        └── 精确依赖 A3 Element
```

引用包含 origin、packageId、version、releaseDate 和 SHA。SHA 表达精确内容身份，
不等于发布者身份或安全沙箱。

## 4. `pip-seed`：可信启动链

```text
pip-seed/
├── runtime/     Rust 公共运行时：解析、Catalog、Profile、信任
├── cli/         命令行入口与最小 HTTP 宿主
├── tauri/       桌面 WebView 宿主
├── loader/      A1 Loader 浏览器 UI
└── repo/system/ 权威 A0–A2 PIP
```

启动处理链：

```text
显式参数或分发目录
  ↓
发现有效 A1
  ↓ 文件名、Manifest、层级、策略和完整性校验
A1 Loader
  ↓ 兼容性与用户选择
A2 Editor
```

Seed 保持无状态；最近项目、版本选择、下载、更新和恢复体验属于 Loader。
`repo/system` 只保存权威系统 PIP，不包含发现或加载机制。

## 5. `pip-editor`：A2 机制层

```text
pip-editor/
├── web/                 浏览器挂载入口
├── pip/            Pip 数据内核
├── pip-package/         PIP 编解码、策略、资源和 Bundle
├── pip-host/       通用编辑宿主
└── pip-host-io/    A2 内置高权限系统插件
```

### 5.1 `web/`

`web/main.tsx` 只负责将 `PipHost` 挂载到静态页面。它不安装领域插件，也不
拥有工作区状态。

### 5.2 `pip/`

唯一持久化事实是：

```text
Pip (DOCUMENT)
└── pips: Pip[] (GRAPH / metadata PIPE)
    └── pips: Pip[] (NODE / metadata PIPE)
        └── pips: Pip[] (PIPE)

每个 Pip: id + fork_level + predicate_value? + pips
predicate_value: { predicate: PipRef, value: const | ref | op }
PipRef: { node_id, pip_id, pip_id_parent? }
```

主要机制：

- `types.ts` 定义统一 Pip、fork level、Ref 和 Patch。
- `core-graph.ts` 自举 `identity`、`predicate`、`type`，并提供三个元数据谓词。
- `pip-model.ts` 派生节点字典，通过元数据 PIPE 读写 revision、根节点与工作区状态。
- `reference-index.ts` 动态派生 incoming/outgoing，不持久化第二份边。
- `graph-validation.ts` 校验引用闭包和规范结构。
- `patch.ts` 在副本上应用 revision-bound Patch，并生成 inverse Patch。
- `document.ts` 在 PIP 与工作区边界保存统一 `pip-workspace@3`；`legacy-document.ts` 负责读取旧 v1/v2 格式并迁移。

Graph 修改流程：

```text
原 Graph
  ↓ structuredClone
应用 PipTx
  ↓ 完整 Graph 与 A4 Validator 校验
revision + 1
  ↓
发布新 Graph + inverse Patch
```

失败操作不会部分修改原 Graph；inverse Patch 用于 undo/redo。

### 5.3 `pip-package/`

```text
pip-package/
├── format / codec       PIP 二进制四区段格式
├── manifest / types     A0–A5 Manifest 契约
├── io-policy            容量与授权策略
├── assets               资源编码
├── bundle/              流式 Bundle/Unbundle
└── workspace/           分离式工作区资源存储
```

处理顺序是：

```text
.pip 字节
  ↓ I/O policy
头部、四区段、偏移和长度校验
  ↓
Manifest、文件名、资源 SHA 和依赖闭包校验
  ↓
允许激活 A3/A4 或打开 A5
```

任何可执行入口都在完整性和依赖闭包校验之后运行。

## 6. `pip-host`：编辑处理中心

```text
pip-host/
├── contracts/       宿主与插件共享 ABI
├── packages/        A3/A4/A5 解析、闭包、导入与导出
├── activation/      A3 Element 与 A4 Node Type Registry
├── execution/       会话、触发器、队列和副作用仲裁
├── projection/      Graph → Projection 的纯计算
├── workspace/       业务会话与宿主呈现 Store
├── view/            画布、窗口、Creator 和 Tab
└── pip-host.tsx 以上机制的组合入口
```

`pip-host.tsx` 应只做组合和跨机制协调；具体窗口、Creator、执行、投影和存储
行为分别留在对应目录。

## 7. 两个状态平面

### 7.1 业务 WorkspaceSession

`WorkspaceSessionStore` 保存：

```text
WorkspaceSession
├── graph
├── rootNodeIds
├── views
├── selection / scopedSelections
├── undo / redo
├── capabilityDiagnostics
└── savedGraphFingerprint
```

Graph 修改进入 revision 和图历史。相机、选择、窗口 frame 等视图状态不增加
Graph revision。A5 导出可以保存业务 workspace views，但会过滤所有系统窗口。

### 7.2 宿主 HostCanvasState

`HostPresentationStore` 保存：

```text
HostCanvasState
├── world / camera
├── workspaceWindows
├── systemWindows
├── activeWindowId
└── frontWindowId
```

它只表示 A2 如何呈现工作区和系统工具，不进入业务 Graph、PipDocument、
undo/redo 或 A5。当前只在应用会话内存中存在。

同一个 WorkspaceSession 可以有两种宿主外象：

```text
WorkspaceSession
  ├── tab：全屏工作区
  └── window：宿主画布上的 WorkspaceWindow
```

Tab 与 Window 切换不复制业务状态，也不构成工作区嵌套。

## 8. A3/A4 插件处理链

### 8.1 A3 Element

A3 Registry 建立 `elementId → custom element tag` 映射。A3 接收宿主和 A4 已经
投影好的模型，负责视觉与交互，通过 `PipElementRequest` 表达操作意图，
不直接写入 Graph。

### 8.2 A4 Node Type

A4 Registry 可以注册：

- Node Type、Validator 和 Command；
- Creator、Projection 和 Executor；
- Language Provider、Trigger 和 Effect Handler；
- Execution Planner、Node Runtime 和 Pip Operator。

标准业务修改链：

```text
A3 用户操作
  ↓ PipElementRequest
pip-host-actions
  ↓
A4 Command / Creator
  ↓ PipTx
WorkspaceSessionStore
  ↓ 原子校验、提交和历史记录
PipGraph 新 revision
  ↓
Projection 重新计算 → A3 重新渲染
```

Creator 可以返回 Patch、root 增量和首选 Projection frame，宿主把三者作为一个
事务提交，使 undo/redo 同时恢复 Graph、roots 和 views。

## 9. Projection 外象层

```text
Node Instance
  ↓ observes
Projection Instance
  ↓ uses
Projection Definition
  ↓ element
A3 Element
```

Projection 有两个正交维度：

```text
scope：   self | children
surface： workspace | embedded
```

Overview、Detail、Flow、World Events 等名称不是固定系统层级。同一
`observedNodeId + scope` 的 Projection 是同层替换；只有 Projection Instance
显式声明 `dives-into` 才会进入下一语义深度。

`projection/` 中的 route、navigation 和 semantic zoom 都从 Graph 和 A4 注册项
计算，不把另一份投影树持久化到 Graph。

## 10. 宿主画布、Creator 与统一窗口

编辑器启动时工作区列表为空，直接显示永久宿主画布。用户可以：

- 在当前聚焦画布按空格打开 Creator；
- Alt/Option + 左键拖拽，在释放位置打开 Creator；
- 从 Tab 栏 `+` 在宿主画布打开 Creator；
- 把 Tab 拖入宿主画布，切换为工作区窗口。

业务 Projection、工作区本体、Creator 和系统插件统一复用 `WorkspaceWindow`：

- 拖动；
- 三向或八向尺寸缩放；
- 关闭；
- 玻璃背景；
- 内容或相机缩放控件。

Creator frame 属于临时 UI 状态；不会进入业务 views、图历史或宿主持久化。

## 11. `pip-host-io`：A2 系统插件

```text
pip-host-io/
├── system-plugin/
│   ├── contracts
│   ├── registry
│   ├── runtime
│   ├── renderer
│   └── canvas-bridge
├── plugin-manager/
└── preferences/
```

系统插件使用独立合法的 PipGraph overlay。系统 type node 与 instance node
都有标准 `identity/type` 关系，但不会合并到任何业务 Graph。

系统插件的两个维度不能混淆：

- `scope` 决定实例生命周期：`host | workspace`。
- `surfaces` 决定允许呈现的位置：`host | workspace`。

host-scope 单例可以在宿主和多个工作区同时呈现，共享实例状态，但每个呈现拥有
独立 frame。关闭窗口只撤下该呈现；系统 overlay、实例状态和窗口永不进入 A5。

## 12. `pip-editor-io`：领域插件套件

```text
pip-editor-io/
├── pip-projections/  通用 Pip Projection
├── intent/                Intent 领域套件
├── scene/                 Scene 领域套件
├── spot-terminal/         Spot Terminal 领域套件
└── shared/                插件构建共享代码
```

典型插件目录：

```text
domain.ts       领域节点、predicate 和构造定义
suite.ts        组装 A3/A4/A5 PIP
elements/       A3 表现层
runtime/        A4 语义、命令、Creator、Projection
```

这些插件不会被空白 A2 自动安装。`pip-host-io` 是可信宿主能力，
`pip-editor-io` 是可安装领域能力，二者有不同的生命周期和信任边界。

## 13. 导入与导出全流程

### 13.1 导入 portable A5

```text
选择 .pip
  ↓
I/O policy、外层四区段和 Manifest 校验
  ↓
递归校验内嵌 A3/A4、文件名、版本和 SHA
  ↓ 一次信任确认
按 A3 → A4 顺序激活 Registry
  ↓
构造 A5 WorkspaceSession
  ↓ 用户偏好
呈现为 Tab 或 Host WorkspaceWindow
```

任一步失败都不会留下部分工作区或部分持久化信任。

### 13.2 导出 A5

```text
WorkspaceSession
  ↓
过滤系统窗口与运行时状态
  ↓
PipDocument v2：graph + rootNodeIds + workspace
  ↓
Node Map + 精确 A4 依赖闭包
  ↓
编码 portable A5 PIP
```

宿主布局、Creator、系统 overlay、系统实例和编辑器偏好不会进入输出。

## 14. 构建与自宿主

```text
可读源码
  ↓ scripts/pip-system-sources.mjs 定义边界
A0–A2 source PIP
  ↓ audit / extract / seal
隔离构建候选 + receipt
  ↓ 测试与显式 promote
pip-seed/repo/system
```

常用命令：

- `npm run pip:system`：重建当前 A0–A2 系统 PIP。
- `npm run pip:self:audit`：验证 PIP 内源码与仓库源码一致。
- `npm run pip:self:extract`：从系统 PIP 提取可读源码。
- `npm run pip:self:seal`：封存候选源码树。
- `npm run pip:self:build`：隔离构建 A0–A2 候选和 receipt。
- `npm run pip:promote-system`：验证并显式晋升候选。
- `npm test`：构建编辑器并运行跨层测试。

`dist` 和 `out` 都是派生产物。权威源码在可读源码目录，权威系统 PIP 在
`pip-seed/repo/system`，两者通过源码边界清单和自宿主审计保持一致。

## 15. 最短心智模型

```text
A0/A1 负责可信启动
       ↓
A2 负责通用宿主、事务和呈现机制
       ↓
A3 负责外观与交互
A4 负责语义与行为
A5 负责业务数据
       ↓
PipTx 是唯一业务 Graph 修改入口
       ↓
Projection 是 Node Instance 的外象
       ↓
Tab、Window、Embedded 与 System Overlay 只是呈现和宿主状态
```
