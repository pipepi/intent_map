# Intent Map 编辑器架构

`app/page.tsx` 只是路由入口。编辑器按“组合根 → 会话/控制器 → 视图 → 纯逻辑”分层，页面文件不再承载业务规则。

## 层次结构

```text
HomePage
└── IntentEditor
    ├── useEditorUiSession
    ├── useDocumentSession
    ├── useEditorCanvasController
    ├── useEditorAuthoringController
    ├── useEditorRuntimeController
    ├── useNodeSurfaceController
    └── EditorWorkspaceContainer
        ├── EditorWorkspace
        └── ScopeCanvasContainer
            └── ScopeCanvas
            ├── ScopeNavigationBar / ScopeHeader
            ├── BusinessScopeLayer | AppScopeContent
            ├── ContainerResizeControls
            └── runtime toast
```

### 页面与组合根

- `../page.tsx`：Next.js 客户端页面入口，只渲染 `IntentEditor`。
- `intent-editor.tsx`：编辑器组合根，只创建五个领域 session、节点 renderer 和两个顶层容器。

### 会话与控制器

- `use-editor-ui-session.ts`：局部选择、搜索、legend、pending pipe 与 feedback 生命周期；业务选择通过 runtime adapter 绑定，不复制事实源。
- `use-document-history.ts`：文档事实源、历史栈、dirty 状态和两类写入通道。
- `use-document-session.ts`：组合历史、运行时管线、导航上下文、文档 IO、新建和宿主加载。
- `use-editor-canvas-controller.ts`：组合 scope、camera、projection、navigation、pointer 和 auto-layout，并直接输出画布 capability。
- `use-editor-authoring-controller.ts`：组合 Schema、Panel、应用节点和业务创作操作，按 Workspace、Canvas、NodeSurface 和 Command 输出能力。
- `use-editor-runtime-controller.ts`：组合运行状态、快捷键、RuntimeCommand 映射和执行器。
- `use-runtime-pipeline.ts`：事件批处理、运行时状态及命令生成。
- `use-business-run-state.ts`：业务执行、取消、输入和 trace。
- `use-scope-session.ts`：两棵树投影、当前作用域、导航栈、连线/校验派生及浏览上下文持久化。
- `use-canvas-projection-actions.ts`：节点与容器投影持久化、显示和缩放模式切换。
- `use-canvas-camera-session.ts`：相机状态、作用域恢复/适应策略和相机相关 refs。
- `use-editor-shortcuts.ts`：全局键盘命令与未保存文档的离开页面保护。
- `use-canvas-pointer-gestures.ts`：触摸状态及平移、节点缩放、容器缩放手势接线。
- `use-panel-navigation-actions.ts`：全局业务跳转与 Panel 内独立导航、选择。
- `use-authoring-schema-actions.ts`：节点 ID、端口 schema 与输入/输出绑定操作。
- `use-application-node-actions.ts`：应用节点新增、复制、删除和应用图重置。
- `use-workspace-view-actions.ts`：Workspace/View 的更新与另存行为。
- `use-business-authoring-session.ts`：按节点、几何、管道和模块分组业务操作。
- `use-node-surface-controller.tsx`：以 `EditorCapabilities` 分组节点面板所需能力。
- `runtime-command-actions.ts`：按 document/canvas/authoring/runtime/navigation 生成完整命令映射。
- `editor-view-models.ts`：纯函数生成业务图层、边渲染和画布派生模型。
- `use-runtime-command-executor.ts`：受支持命令的完整类型映射和批次执行。

### 视图层

- `editor-workspace-container.tsx`：按文档、创作、View 和 feedback 能力接线 Workspace；唯一调用 `useWorkspaceViewActions` 的位置。
- `editor-workspace.tsx`：文件输入和 `Workspace` 外壳。
- `scope-canvas-container.tsx`：按作用域、画布、选择、创作、导航和 feedback 能力装配画布模型；唯一组合业务图层、连线和画布派生 adapter 的位置。
- `scope-canvas.tsx`：viewport、相机变换和作用域条件渲染矩阵；仅接收 `model/actions/refs` 三组属性。
- `canvas-layers.tsx`：应用画布的导航、头部、内容和容器缩放叶子组件。
- `business-scope-layer.tsx`：业务图组件的接线适配。
- `node-surfaces.tsx`、`edge-renderer.tsx`：节点面板和 SVG 连线渲染适配器。

### 行为与纯逻辑

- 组合工厂：`scope-camera.ts`、`scope-navigation.ts`、`pointer-gestures.ts`、`business-ops.ts`、`document-io.ts`。
- 纯函数：`tree-utils.ts`、`bindings.ts`、`validation.ts`、`executor.ts`、`auto-layout.ts`。

## 约束

- 结构修改走历史提交，布局、相机和显示模式走视图提交；不要混用。
- 含 ref 的工厂闭包只在事件或 effect 中执行。
- 视图组件不直接修改文档，所有修改通过注入的 action 完成。
- 新增 RuntimeCommand 时，必须同步扩充 `SupportedRuntimeCommand` 与执行 action 映射。
- 领域 controller 可以组合既有小 hooks，但不得复制其算法或反向依赖视图容器。
- 组合根只消费 capability，不得重新展开底层 refs、工厂 deps 或命令映射。

## 验证

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/eslint app/page.tsx app/editor/
./node_modules/.bin/esbuild app/page.tsx --loader:.tsx=tsx --jsx=transform --outfile=/dev/null
```
