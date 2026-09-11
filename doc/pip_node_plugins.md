# A3–A5 PipNode PIP 架构

[工程目录与处理机制](project_structure.md) ·
[Pip Host](../pip-editor/pip-host/README.md)

元数据按谓词身份识别，不依赖固定的局部 ID。revision 元数据与业务节点同名时使用 `revision~1` 等可用 ID，保留业务节点身份、引用和根节点列表；事务更新保持该元数据 ID 稳定，同谓词重复元数据仍会被拒绝。

核心唯一事实是 `Pip`：`DOCUMENT → GRAPH → NODE → PIPE` 均通过 `pips` 包含子项，`predicate_value` 可省略，但出现时必须同时具备 `predicate` 与 `value`。引用使用 `{ node_id, pip_id, pip_id_parent? }`。incoming、节点字典、边和投影均由索引或插件动态推导。`applyPipTx()` 在副本上完成闭包校验并一次增加元数据 PIPE 中的 revision。

`pip.meta.revision`、`pip.meta.root-node-ids` 和 `pip.meta.workspace` 是元数据谓词节点，与原有三个核心概念共同提供引用闭包。GRAPH 的 `revision` PIPE、DOCUMENT 的 `root-node-ids` / `workspace` PIPE 分别保存常量值。公开 API 统一使用 Pip 命名，例如 `createCorePipGraph`、`applyPipTx`、`createPipDocument`。

新文档只写出 `pip-workspace@3`。旧 `relation-workspace` v1、`relation-workspace@2` 和 `relation-workspace@3` 在加载时迁移，已知官方 `relation.*` 身份和引用同步转换成 `pip.*`，身份碰撞会拒绝迁移。普通文本、未知第三方 ID、原包字节与精确依赖哈希不改写。旧可执行插件必须重建；旧 A5 数据包先验证原始内容，再迁移文档，缺少依赖时明确报错。

`PipTx` 使用 `schemaVersion: 2`，只有 `{ op: "put", parent_path, pip }` 和 `{ op: "remove", parent_path, pip_id }` 两种操作。`parent_path` 是相对传入根 Pip 的逐层 ID 路径，空数组表示根的直接子项；put 原位替换同 ID 子项或追加新项，remove 删除完整子树。返回 `{ pip, inverse }`，逆补丁保留兄弟顺序。GRAPH / DOCUMENT 必须提供匹配的 `baseRevision`，每次提交由执行器将 revision 加一；NODE / PIPE 独立编辑不传 revision，仅进行结构校验，引用闭包在图中校验。旧版补丁不兼容，插件需重新构建。

旧数据迁移不改写可执行插件源码；依赖旧 `nodes/relations/object` 字段或旧 ABI 的 A3/A4 插件需要按新模型重新构建。本仓库领域插件由 `npm run plugins:pip:build` 生成对应的新 PIP。

六层协议固定为 A0 Seed、A1 Loader、A2 Editor、A3 Node Element Plugin、A4 Node Type Plugin、A5 Node Map。A4 通过完整 `PipPackageRef` 精确依赖 A3，A5 只直接依赖 A4；引用包含 origin、packageId、version、releaseDate 和 SHA。

A3 的 PipDocument 描述元素包，assets 保存自包含 `entry.mjs` 与披露源码。A4 的 PipDocument 是 ontology，entry 注册类型、验证器、命令、执行器、投影、creator 与语言能力。A5 的 PipDocument 保存 Node Map，`workspace.json` 保存视图；它没有可执行入口。

portable A5 使用扁平 `packages/<canonical-name>.pip` 携带 A3/A4，也可携带 launch profile 指向的 A1/A2。宿主先验证外层四区段、全部内嵌 PIP、规范文件名及精确闭包，再请求一次信任确认；任一步失败都不会创建工作区或持久化部分信任。确认后按 A3→A4→A5 顺序激活和打开。

`pip-editor-io/` 下的 `intent`、`scene`、`pip-projections` 与
`spot-terminal` 是可独立构建和安装的领域插件套件。Scene 的多个
projection-instance 根保持独立领域相机和选择，同时观察同一世界节点；业务工作区
以 `free-layout` views 保存投影窗口、3/8 向 resize 模式与画布相机。业务窗口状态
不增加 PipGraph revision。

工作区本体可以在 A2 宿主中呈现为全屏 Tab 或普通 `WorkspaceWindow`，两种呈现
共享同一个 WorkspaceSession。宿主画布、工作区宿主窗口和宿主系统窗口由独立
HostPresentationStore 管理，不进入 A5。随 A2 发布的插件管理器和偏好设置位于
`pip-editor/pip-host-io/`；它们使用独立系统 PipGraph overlay 中的虚拟
PipNode，并与业务 Graph、图历史和 A5 导出隔离。

A4 creator 返回 revision-bound PipTx、可选 root 增量和首选投影尺寸。宿主将三者作为一个事务验证与提交，undo/redo 同时恢复图、roots 和 views。空白 Alt/Option 拖线不持久化 edge，只把释放点转换为世界坐标并打开候选创建器。

A3/A4 代码与浏览器主窗口同权运行。ESM lexer 对入口的 import 做结构限制，但这不是安全沙箱；SHA 表达精确内容身份，不表达发布者身份。原生签名、公证与发布者信任属于后续安全层。
