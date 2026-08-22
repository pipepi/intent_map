# 三层 RelationNode 插件架构

## 唯一事实模型

核心只持久化 `RelationGraph -> RelationNode -> Relation[]`。Relation 可以递归携带 Relation，predicate 和 ref 都使用稳定的 `{ nodeId, relationId }`；节点本体由 identity relation 表示。关系由观察者或消费者一侧保存，反向关系和各种边只在索引或投影中产生。

`applyRelationPatch()` 在图副本上原子应用操作，检查 revision、闭包内 relation ID、递归深度及所有 predicate/ref。删除被引用节点时，同一 patch 必须先清除引用。成功提交只增加一次 revision，并返回可用于 undo 的反向 patch。

## 插件边界

核心提供三类 V2 包协议。可执行包的 runtime ABI 是 `relation-element/2` 和
`relation-node-type/2`；包 schema 仍为 2，旧 `/1` runtime ABI 会被明确拒绝：

1. 元素插件用 Web Component 呈现节点、关系和工作区，通过事件提出操作请求。
2. 节点类型插件以可执行 ESM 注册领域 ontology、识别、校验、命令、执行、投影与语言能力。
3. 节点集合插件保存具体图、视图状态和精确依赖，不包含可执行入口。

同一工作区可被多个节点类型插件共同解释，但每个 type ref 只能有一个活动 provider。打开集合总是复制为独立 workspace。集合导出沿 predicate/ref 和组合关系求完整可达闭包；导入冲突通过 node/relation ID 映射递归重写。

Collection 的 `rootNodeIds` 会原序复制到 workspace。宿主先为每个根节点解析
`purpose: "workspace"` 的投影；多个根可同时形成多个投影实例，宽屏并排、窄屏纵向排列。
每个实例可持久保存自己的相机、选择和视图关系，同时观察同一份领域数据。投影函数必须是
同步纯计算并返回 JSON；匹配、计算或 JSON 校验失败只降级对应实例，不中断整个工作区。

## 外置领域套件

`pip-editor-plugins/intent/` 和 `pip-editor-plugins/scene/` 分别构造 Element、Node Type、Collection 三个包。核心源码不导入这些目录，空白启动也不自动安装。Intent 的端口、作用域、执行和工作台，以及 Scene 的事件几何、时间视图与中文语言解析，均由对应插件注册并投影。Scene collection 以同为 `scene.type.projection-instance` 的象限和管道节点为有序根；它们独立保存视图状态，并通过 `observes` 观察同一个 `scene.type.scene` 世界节点。

节点类型代码和元素代码都在浏览器主窗口运行，拥有宿主同等 DOM、存储和网络权限；系统不把它们描述为沙箱。manifest 权限与哈希仅用于信息披露和完整性校验。ESM lexer 会拒绝 entry 中直接出现的静态、动态和重导出依赖，以维持单文件 ABI，但该检查不构成对任意 JavaScript 的安全隔离。

Collection ZIP 安装是纯数据操作。打开集合时才按 Element、Node Type 顺序尝试激活内嵌依赖；失败不会阻止创建工作区，而是记录结构化能力诊断。由于主窗口模块和 Custom Elements 不可回滚，执行失败后可能需要刷新才能彻底清除副作用。

集合目录使用规范化内容 SHA 固定 `id@version` 的内容，同版本内容漂移会被拒绝，workspace 来源同时记录该 SHA。可执行 registry 对同 ID 的并发激活只执行一次模块；节点类型的实际 type identity 注册必须与 manifest 精确相等。插件 disposer 的异常会作为诊断上报，但不能阻止宿主清除其 ABI 注册项。
