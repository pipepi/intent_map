# Intent Map：通用分形节点地图编辑器

[← 上一篇：Loader N](loader_n.md) · [返回总体方案](../intent_map_position.md) · [下一篇：Software Authoring →](software_authoring.md)

## 定位

Intent Map 是系统默认提供的一个 a2 通用节点编辑器，提供树形地图和图视图。
a2 是编辑器类别而不是单一实现：用户可以选择表格、表单、空间画布或其他
兼容 `pip-editor/1` 的编辑器。一个窗口只运行一个主 a2。

## 核心能力

- 创建、编辑、删除和移动节点；
- 节点的无限层级嵌套与分形导航；
- 进入、退出和聚焦局部作用域；
- 输入输出端口、绑定和连接；
- 节点引用、组合和通用投影；
- 选择、布局、相机和编辑历史；
- 导入、导出和查看节点文档；
- 将编辑结果保存为新的 `.pip`。
- 根据目标文档类型列出兼容 a2，并在用户确认后用新窗口打开；
- 不透明保存 a3 自定义节点数据，但不加载或解释 a3。

## 业务无关边界

Intent Map 内核不应认识：

- 聊天或业务内树；
- UI、DB Tables、API 和代码层；
- 软件开发工作流；
- Crypto 交易所；
- Agent 任务、提示词或模型供应商。

这些概念由 a3 自定义节点、外树资源或外部操作者提供。通用编辑器只认识纯意图、
节点、端口、连接、容器、作用域和编辑历史；a3 生命周期由外层工作区宿主管理。

## 产品形态

Intent Map 更接近 Blender 或 Photoshop，而不是固定领域的应用生成器。

| 创作软件 | Intent Map / PIP |
|---|---|
| 场景、画布 | 分形节点地图 |
| 对象、图层 | 节点、树枝和投影 |
| 分组和层级 | 分形嵌套与作用域 |
| 缩放、聚焦 | 选择合适颗粒度 |
| 选区 | 人或工具操作的局部边界 |
| 手工工具和插件 | 节点能力、脚本、Agent 等 |
| `.blend` / `.psd` | `.pip` |
| 渲染与导出 | 查看、组合和分发 |

## 可选 Bevy 画布运行时

Intent Map 可以将 [Bevy Canvas Runtime](bevy_canvas_runtime.md) 作为可选高性能画布投影：React 继续拥有 Intent Document、工作台、表单、Undo/Redo 和 DOM 交互，Bevy 编译为 WASM，只负责 Canvas 内的 ECS、节点与连线渲染、Camera、LOD、Picking、拖动和动画。

```text
Intent Document / React（唯一真相源）
        ↓ 首次快照 + 增量命令
Bevy ECS / WASM（可重建投影）
        ↓
Canvas（高性能节点地图）
```

第一阶段可把 Bevy WASM 作为某个 a2 编辑器的静态资产；通信契约稳定后，可发布为另一种可选择的 a2 空间编辑器。它不属于 a3 业务无关能力，因为画布渲染是主编辑器自身职责。Bevy 缺失或禁用时，Intent Map 必须能够回退现有画布实现。

[查看完整的 React × Bevy 融合方案 →](bevy_canvas_runtime.md)

## 与其他子系统的边界

- [Loader N](loader_n.md) 负责选择和启动 `intent_map.pip`；
- Intent Map 提供通用节点编辑，不实现加载器产品体验；
- [Software Authoring](software_authoring.md) 通过业务节点使用 Intent Map；
- [Crypto CEX](crypto_cex.md) 使用 Software Authoring 表达真实业务；
- [Bevy Canvas Runtime](bevy_canvas_runtime.md) 是可选渲染投影，不进入文档语义；
- MCP 可以让 Agent 操作 Intent Map，但属于可选接入方式。
- [Runtime Profile](pip_runtime_profiles.md) 精确选择 a1、一个主 a2 和 a3 扩展集合。

## `.pip` 自举关系

```text
intent_map.pip 由 Loader N 打开
→ Intent Map 打开另一个 .pip
→ 用户编辑节点和产物
→ Intent Map 导出新的 .pip
→ 新 PIP 再次被 Loader 或 Intent Map 打开
```

Intent Map 自身也可以作为被编辑对象，但必须避免把某个具体应用的业务语义反向固化进通用内核。

## 实现映射

该文档应对应以下类型的代码：

- 通用文档和节点模型；
- Workspace、Panel、Surface 与作用域；
- 节点、端口、边和投影渲染；
- 相机、拖动、缩放和布局；
- 可选画布运行时及其稳定投影接口；
- 撤销、重做、导入和导出；
- 通用编辑命令管线与节点视图注册；
- Intent Map 自身的 `.pip` 构建。

现有 `app/editor/`、`app/runtime/` 中的代码应逐步按这一边界检查：通用能力保留，软件开发或案例语义上移到对应 PIP。

## 验收条件

- 能编辑不属于软件开发领域的节点应用；
- 能在任意树枝间缩放和聚焦；
- 能导入、修改并导出有效 `.pip`；
- 不加载 Software Authoring 时仍完整可用；
- 不使用 Agent 时仍完整可用；
- 能用自身继续编辑或构建自身。

---

[← 上一篇：Loader N](loader_n.md) · [Bevy Canvas Runtime](bevy_canvas_runtime.md) · [返回总体方案](../intent_map_position.md) · [下一篇：Software Authoring →](software_authoring.md)
