# app/editor —— 页面编辑器模块导览

本目录由 `app/page.tsx`（原 4092 行单文件组件）按功能特性拆分而来。
拆分后 page.tsx 保留：状态声明、副作用、作用域导航、撤销/重做、文档导入导出、
deps 组装与主 JSX 骨架；可独立测试/复用的逻辑全部下沉到本目录。

## 模块清单

| 模块 | 行数 | 职责 | 模式 |
|---|---|---|---|
| `constants.ts` | 14 | 画布交互常量（缩放上下限、节点/画布尺寸、端口排距） | 纯常量 |
| `tree-utils.ts` | 111 | 节点树工具：uid/clone/findNode/findPath/updateNode/removeNode/freePanelContext/nodeSize/nodeResizeMode/sampleDocument | 纯函数 |
| `bindings.ts` | 95 | 绑定表达式引用收集、管道边聚合（AggregatedEdge）、作用域边界边推导（ScopeBoundaryEdge） | 纯函数 |
| `validation.ts` | 140 | 管道循环依赖检测 detectCycle、作用域校验 collectValidationIssues | 纯函数 |
| `executor.ts` | 156 | 业务执行器：evaluateExpression 表达式求值、executeBusinessNode 节点执行（Trace 轨迹） | 纯函数 |
| `download.ts` | 14 | 浏览器二进制下载 downloadBytes | 纯函数 |
| `node-surfaces.tsx` | 696 | 节点内容渲染器 renderNodeSurface（16 种面板分支）+ renderTree | deps 注入 |
| `pointer-gestures.ts` | 454 | 画布指针手势：视口平移/双指缩放、节点移动、节点缩放、作用域画布缩放 | 工厂函数 |
| `business-ops.ts` | 551 | 业务节点操作族：模块发布/插入、增删复制、连线拖拽、移动/缩放/显示模式 | 工厂函数 |
| `edge-renderer.tsx` | 202 | SVG 连线渲染：聚合管道边 renderEdge、边界虚拟边 renderScopeBoundaryEdge | deps 注入 |
| `auto-layout.ts` | 93 | 泳道自动布局 computeLaneAutoLayout（runtime/interface/output 三泳道贪婪堆叠） | 纯函数 |
| `business-scope-layer.tsx` | 113 | 业务作用域图层组件 BusinessScopeLayer（BusinessGraphProjection 的接线适配） | React 组件 |

## 两种复用模式

### 1. deps 注入（渲染类：node-surfaces / edge-renderer）

```tsx
// page.tsx 每次渲染组装 deps 对象，渲染函数签名保持 (数据, deps) 两参：
const edgeRendererDeps: EdgeRendererDeps = { scopeNode, worldSize, ... };
appEdges.map((edge) => renderEdge(edge, edgeRendererDeps));
```

### 2. 工厂函数（行为类：pointer-gestures / business-ops）

```tsx
// 工厂在渲染期调用一次，返回闭包；闭包只在事件回调中读取 ref/状态：
const startPipeDrag = createStartPipeDrag(businessOpsDeps);
```

**注意**：`react-hooks/refs` 规则会把"渲染期把含 ref 的 deps 传给工厂"
误报为渲染期读 ref。处理方式是在工厂调用块外包裹带说明的块级豁免：

```tsx
/* eslint-disable react-hooks/refs -- 工厂模式：deps 含 ref，但仅在事件回调中读取 */
const publishModule = createPublishModule(businessOpsDeps);
...
/* eslint-enable react-hooks/refs */
```

### 3. React 组件（business-scope-layer）

```tsx
// 含 ref 闭包的回调族必须以组件形式使用，不要当普通函数调用——
// 作为组件 props 传入的回调才会被 React 视为事件处理器（延迟执行），
// 否则 react-hooks/refs / react-hooks/purity 会误判为渲染期调用：
<BusinessScopeLayer {...businessScopeLayerDeps} />
```

### TDZ 规避

deps 中若引用组件后段才声明的函数（如 `updateInputBinding`），
用箭头函数惰性转发，不要直接引用：

```tsx
updateInputBinding: (nodeId, portId, value) => updateInputBinding(nodeId, portId, value),
```

## page.tsx 剩余结构（约 2390 行）

| 区段 | 说明 |
|---|---|
| 状态声明 | useState/useRef 集中区 |
| 当前作用域派生 | 主 JSX 六个条件渲染标志（scopeMinimized/isBusinessScope/navigationStack 等） |
| 布局投影持久化 | 位置/尺寸写入 surface.projections |
| 作用域导航 | 钻取栈压入/弹出、相机定位、滚轮手势 |
| 撤销/重做 | history/future 双栈 |
| 文档加载/导入/导出 | v3 JSON 与 .pip 种子 |
| deps 组装 + 主 JSX | nodeSurfaceDeps/pointerGestureDeps/businessOpsDeps/edgeRendererDeps/businessScopeLayerDeps |

## 后续可选拆分（收益递减，按需进行）

- 作用域导航族（约 400 行：`centerScopeAtScale`/`navigateToScopeFrame`/`onWheel`）：
  相机 + 导航栈 + 滚轮手势耦合最深，风险最高，建议有导航相关需求变更时再做
- 布局投影持久化（约 300 行）：多个 effect 与状态 setter 交织，收益一般

## 验证基线

改动后须通过：

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json        # 0 错误
./node_modules/.bin/eslint app/page.tsx app/editor/       # 恰好 2 errors + 3 warnings（项目既有问题）
./node_modules/.bin/esbuild app/page.tsx --loader:.tsx=tsx --jsx=transform --outfile=/dev/null
```

既有问题清单（不要新增，也暂不修）：setState-in-effect ×1、
渲染期写 actionRefs ×1、exhaustive-deps ×2、未使用的 eslint-disable ×1。
