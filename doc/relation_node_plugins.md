# A3–A5 RelationNode PIP 架构

[工程目录与处理机制](project_structure.md) ·
[Relation Host](../pip-editor/relation-host/README.md)

核心唯一事实仍是 `RelationGraph → RelationNode → Relation[]`；incoming、边和投影均由引用索引或插件动态推导。`applyRelationPatch()` 在副本上完成闭包校验并一次增加 revision。

六层协议固定为 A0 Seed、A1 Loader、A2 Editor、A3 Node Element Plugin、A4 Node Type Plugin、A5 Node Map。A4 通过完整 `PipPackageRef` 精确依赖 A3，A5 只直接依赖 A4；引用包含 origin、packageId、version、releaseDate 和 SHA。

A3 的 RelationDocument 描述元素包，assets 保存自包含 `entry.mjs` 与披露源码。A4 的 RelationDocument 是 ontology，entry 注册类型、验证器、命令、执行器、投影、creator 与语言能力。A5 的 RelationDocument 保存 Node Map，`workspace.json` 保存视图；它没有可执行入口。

portable A5 使用扁平 `packages/<canonical-name>.pip` 携带 A3/A4，也可携带 launch profile 指向的 A1/A2。宿主先验证外层四区段、全部内嵌 PIP、规范文件名及精确闭包，再请求一次信任确认；任一步失败都不会创建工作区或持久化部分信任。确认后按 A3→A4→A5 顺序激活和打开。

`pip-editor-io/` 下的 `intent`、`scene`、`relation-projections` 与
`spot-terminal` 是可独立构建和安装的领域插件套件。Scene 的多个
projection-instance 根保持独立领域相机和选择，同时观察同一世界节点；业务工作区
以 `free-layout` views 保存投影窗口、3/8 向 resize 模式与画布相机。业务窗口状态
不增加 RelationGraph revision。

工作区本体可以在 A2 宿主中呈现为全屏 Tab 或普通 `WorkspaceWindow`，两种呈现
共享同一个 WorkspaceSession。宿主画布、工作区宿主窗口和宿主系统窗口由独立
HostPresentationStore 管理，不进入 A5。随 A2 发布的插件管理器和偏好设置位于
`pip-editor/relation-host-io/`；它们使用独立系统 RelationGraph overlay 中的虚拟
RelationNode，并与业务 Graph、图历史和 A5 导出隔离。

A4 creator 返回 revision-bound RelationPatch、可选 root 增量和首选投影尺寸。宿主将三者作为一个事务验证与提交，undo/redo 同时恢复图、roots 和 views。空白 Alt/Option 拖线不持久化 edge，只把释放点转换为世界坐标并打开候选创建器。

A3/A4 代码与浏览器主窗口同权运行。ESM lexer 对入口的 import 做结构限制，但这不是安全沙箱；SHA 表达精确内容身份，不表达发布者身份。原生签名、公证与发布者信任属于后续安全层。
