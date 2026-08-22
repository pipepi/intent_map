# A3–A5 RelationNode PIP 架构

核心唯一事实仍是 `RelationGraph → RelationNode → Relation[]`；incoming、边和投影均由引用索引或插件动态推导。`applyRelationPatch()` 在副本上完成闭包校验并一次增加 revision。

六层协议固定为 A0 Seed、A1 Loader、A2 Editor、A3 Node Element Plugin、A4 Node Type Plugin、A5 Node Map。A4 通过完整 `PipPackageRef` 精确依赖 A3，A5 只直接依赖 A4；引用包含 origin、packageId、version、releaseDate 和 SHA。

A3 的 RelationDocument 描述元素包，assets 保存自包含 `entry.mjs` 与披露源码。A4 的 RelationDocument 是 ontology，entry 注册类型、验证器、命令、执行器、投影与语言能力。A5 的 RelationDocument 保存 Node Map，`workspace.json` 保存视图；它没有可执行入口。

portable A5 使用扁平 `packages/<canonical-name>.pip` 携带 A3/A4，也可携带 launch profile 指向的 A1/A2。宿主先验证外层四区段、全部内嵌 PIP、规范文件名及精确闭包，再请求一次信任确认；任一步失败都不会创建工作区或持久化部分信任。确认后按 A3→A4→A5 顺序激活和打开。

`pip-editor-io/intent/` 与 `pip-editor-io/scene/` 各构建 A3、A4、A5。Scene 的多个 projection-instance 根保持独立相机和选择，同时观察同一世界节点。投影函数必须同步、纯计算并返回 JSON。

A3/A4 代码与浏览器主窗口同权运行。ESM lexer 对入口的 import 做结构限制，但这不是安全沙箱；SHA 表达精确内容身份，不表达发布者身份。原生签名、公证与发布者信任属于后续安全层。
