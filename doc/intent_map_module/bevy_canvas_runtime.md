# Bevy Canvas Runtime：React 画布的可选高性能投影

[← 返回 Intent Map](intent_map.md) · [返回总体方案](../intent_map_position.md)

## 定位

Bevy Canvas Runtime 是 Intent Map 的可选画布实现方案：React 继续负责编辑器工作台、文档状态和 DOM 交互，Bevy 编译为 WebAssembly，只拥有一个 `<canvas>`、ECS 世界及高性能渲染循环。

它不改变 Intent Map 的业务无关定位，也不取代 `.pip` 文档模型。Bevy 中的 Entity 只是节点与连线的可丢弃投影；Intent Document 始终是唯一真相源。

```text
Intent Document（权威状态）
        ↓ 快照与增量投影
Bevy ECS（可重建运行时）
        ↓
Canvas（节点、连线、动画、LOD）
```

## 采用方式

React 创建并管理画布容器，Bevy WASM 通过 CSS selector 绑定该画布：

```text
React / Intent Map
├── .pip 文档与业务状态
├── Toolbar、Panel、Dialog、Form
├── Undo/Redo、导入导出、API
└── <canvas id="intent-map-bevy">
        ↓ 绑定
Bevy WASM
├── Entity 与 Transform
├── Camera、缩放和 LOD
├── Picking、拖动和空间索引
├── 节点与连线渲染
└── 动画与性能诊断
```

第一版优先使用 Bevy 的 WebGL2 WASM 后端，使浏览器、Tauri Desktop 和 Tauri Mobile 共用同一套渲染资产。WebGPU 作为后续可选加速路径，不作为首版前提。

## 所有权边界

| 数据或能力 | 权威所有者 |
|---|---|
| 节点业务内容和树结构 | Intent Document / React |
| 保存、Undo/Redo 和外部同步 | React |
| Entity、Transform 和渲染资源 | Bevy |
| 相机、LOD、Picking 和空间索引 | Bevy |
| 拖动中的临时位置 | Bevy |
| 拖动完成后的正式位置 | Intent Document / React |
| 表单、菜单、文本输入和无障碍界面 | React DOM |

Bevy 不直接保存 `.pip`，不独立修改业务节点，也不形成第二份文档状态。React 可以随时根据 Intent Document 销毁并重建整个 Bevy 世界。

## React 与 Bevy 的通信契约

首次加载发送完整渲染快照，之后只发送增量命令，避免 React 每次 render 都复制整棵树。

React 到 Bevy：

```ts
type BevyCommand =
  | { type: "LOAD_GRAPH"; graph: RenderGraph }
  | { type: "UPSERT_NODES"; nodes: RenderNode[] }
  | { type: "REMOVE_NODES"; ids: string[] }
  | { type: "SET_SELECTION"; ids: string[] }
  | { type: "FOCUS_NODE"; id: string }
  | { type: "SET_VIEWPORT"; viewport: Viewport };
```

Bevy 到 React：

```ts
type BevyEvent =
  | { type: "NODE_SELECTED"; id: string }
  | { type: "NODE_MOVED"; id: string; x: number; y: number }
  | { type: "CANVAS_DOUBLE_CLICK"; id?: string }
  | { type: "VIEWPORT_CHANGED"; viewport: Viewport }
  | { type: "PERFORMANCE"; fps: number; entities: number };
```

WASM 只暴露小而稳定的生命周期接口：

```text
start(canvasSelector)
dispatch(command)
stop()
```

低频消息可以使用 JSON。节点拖动、相机移动和大批量布局结果应按动画帧合并，必要时改用 TypedArray，避免跨 WASM 边界传递大量细碎对象。

## 典型交互流程

拖动时由 Bevy 保持高帧率反馈，只在交互完成后提交文档变更：

```text
Pointer Move
→ Bevy 更新临时 Transform
→ Canvas 实时重绘
→ Pointer Up
→ Bevy 发出 NODE_MOVED
→ React 更新 Intent Document
→ 写入 Undo 历史
→ 增量状态回投 Bevy
```

选择、框选、相机移动和布局采用相同模式：高频临时状态留在画布运行时，具有业务意义的完成事件回到 Intent Document。

## DOM 覆盖层

复杂文本和系统交互继续使用 React DOM，而不是在 Bevy 内重复实现：

- 节点名称和内容编辑；
- 中文输入法与多行文本；
- 属性面板、菜单和 Tooltip；
- 文件选择、权限确认和系统对话框；
- 键盘焦点、快捷键和无障碍节点列表。

当需要在节点旁显示 DOM 编辑器时，Bevy 将世界坐标转换为屏幕坐标并发送给 React，React 负责定位覆盖层。Canvas 获得指针焦点时也不应吞掉工作台级快捷键。

## PIP 与构建归属

第一阶段将 Bevy 产物作为 `a2_intent_map` 的普通静态资产打包：

```text
a2_intent_map_*.pip
├── intent_map_bevy.js
├── intent_map_bevy_bg.wasm
├── shaders/
└── 现有 Intent Map 资产
```

当通信契约和能力注册稳定后，可以拆为可选的 Functional PIP：

```text
a3_bevy_canvas_runtime_{major}_{minor}_{patch}_{YYYYMMDD}.pip
```

拆分后，`a2_intent_map` 通过通用画布能力接口选择 React 现有实现或 Bevy 实现。没有 Bevy PIP 时，Intent Map 必须继续完整可用。

宿主和 PIP 构建需要保证：

- `.wasm` 以 `application/wasm` 提供；
- CSP 明确允许所选 WebView 执行 WebAssembly；
- JS glue、WASM、shader 和其他资产参与确定性打包；
- 浏览器、桌面和移动端使用相同版本的通信契约；
- 画布运行时版本不改变 Intent Document 的持久化语义。

## 渐进实施

1. 用独立 Bevy WASM 原型绑定 Intent Map 中的一个 Canvas，只渲染只读节点和连线。
2. 建立稳定节点 ID 映射、Camera、缩放、Picking 和选择同步。
3. 加入拖动、框选和增量命令，正式变更仍提交到 React 的 Undo/Redo。
4. 增加 LOD、空间索引、批量布局和性能诊断，对比现有画布实现。
5. 补齐 DOM 覆盖层、输入焦点、移动端触控和无障碍降级。
6. 通信契约稳定后，再决定是否拆成独立 `a3` PIP。

如果需求只涉及 ECS 调度、布局或可见性计算，而现有画布性能足够，应优先只引入 `bevy_ecs`、`bevy_math` 等轻量 crate，由 React 继续渲染，避免过早引入完整 Bevy Renderer。

## 验收条件

- React 文档状态是唯一真相源，销毁 Bevy 世界不会丢失业务状态；
- 首次快照后可通过增量命令完成添加、删除、移动和选择；
- 拖动期间不要求 React 每帧重渲染，结束后正确进入 Undo 历史；
- DOM 文本编辑、菜单、快捷键和输入法不被 Canvas 破坏；
- 同一 WASM 产物能够被 Web 和 Tauri 宿主加载；
- Bevy 缺失、加载失败或被禁用时可以回退现有画布；
- Intent Document 与 `.pip` 格式不依赖 Bevy Entity 或内部组件结构。

## 参考

- [Bevy Web 示例](https://bevy.org/examples/)
- [Bevy Window Canvas 配置](https://docs.rs/bevy/latest/bevy/window/struct.Window.html)
- [Bevy WASM 构建说明](https://github.com/bevyengine/bevy/blob/main/examples/README.md#wasm)

---

[← 返回 Intent Map](intent_map.md) · [返回总体方案](../intent_map_position.md)
