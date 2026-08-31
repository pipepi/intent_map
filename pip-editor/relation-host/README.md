# A2 Relation Host

[工程目录与处理机制](../../doc/project_structure.md) ·
[A3–A5 插件架构](../../doc/relation_node_plugins.md)

```text
.pip → policy/section/hash/closure validation
     → A3 Element registry → A4 Node Type registry → A5 WorkspaceSession
     → RelationPatch → RelationGraph → projection → WorkspaceWindow
```

- `contracts/` 定义宿主 ABI；包身份直接使用分层 `PipManifest`。
- `packages/` 处理统一 PIP、完整依赖闭包、导入导出与内容信任，不再存在 ZIP 协议。
- `activation/` 只维护 A3、A4 的运行 registry；A5 是纯数据。
- `execution/` 管理执行会话、触发器、队列与副作用仲裁。
- `workspace/` 分别管理业务 WorkspaceSession 与宿主呈现状态。
- `projection/` 从 RelationGraph 纯计算展示数据。
- `view/` 提供宿主画布、工作区画布、Creator 和统一窗口外壳。
- `relation-host.tsx` 只组合 `.pip`、工作区、系统插件和宿主表面。

## 两个状态平面

`WorkspaceSessionStore` 保存业务 Graph、roots、工作区 views、选择和 undo/redo。
Graph 修改只能通过 revision-bound `RelationPatch` 原子提交；相机、选择和窗口布局
不增加 Graph revision。

`HostPresentationStore` 保存宿主相机、工作区窗口和宿主系统窗口。工作区本体仍是
独立 `WorkspaceSession`，可以作为全屏 Tab 或宿主画布上的普通窗口呈现。宿主布局
不进入业务 Graph、RelationDocument、图历史或 A5。

## Creator 与窗口

编辑器默认打开永久存在的空白宿主画布，不再隐式创建空白 Tab。空格键或
Alt/Option + 左键拖拽会在当前聚焦画布打开 Creator；Tab 栏的 `+` 在宿主画布
打开 Creator。Creator、业务投影、工作区窗口和系统插件都复用 `WorkspaceWindow`
的拖动、三向/八向缩放、关闭、玻璃背景和内容缩放结构。

A4 可通过 `registerCreator()` 声明节点或 Projection Instance 创建能力。Creator
返回可选 `RelationPatch`、root 增量和首选窗口尺寸，宿主把它们作为一个事务校验、
提交并记录历史。

## 系统插件

`../relation-host-io/` 保存随 A2 编译的可信系统插件。系统 type node 和 instance
node 是独立系统 RelationGraph overlay 中的标准 `RelationNode`，不是业务 Graph
节点。`scope` 决定 host/workspace 生命周期，`surfaces` 决定允许在宿主或工作区
呈现。插件管理器与偏好设置都是 host-scope 单例，可在多个表面共享实例状态，
但各自保留独立窗口 frame。

关闭系统窗口只撤下相应呈现；系统 overlay、实例状态和窗口在 A5 导出时全部隔离。

A5 仅声明直接 A4 语义依赖；A4 精确引用 A3。portable A5 在扁平 `packages/*.pip` 资产中携带闭包。所有区段、文件名、版本、发布日期和 SHA 在任何代码执行前完成校验。可执行 A3/A4 与浏览器主窗口同权，完整性校验不等于沙箱。
