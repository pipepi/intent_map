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
| `scope-camera.ts` | 190 | 相机族 createScopeCameraOps：设置/适应视图/可见性判断/居中（组合工厂） | 组合工厂 |
| `scope-navigation.ts` | 265 | 导航族 createScopeNavigationOps：返回上级/面包屑/进入节点/最近节点/滚轮手势 | 组合工厂 |
| `document-io.ts` | 175 | 文档 IO 族 createDocumentIO：applyLoadedDocument/exportPip/loadPipBytes/importDocument | 组合工厂 |
| `business-run.ts` | 120 | 业务运行族 createBusinessRun：run（根输入 JSON 解析 + 拓扑执行 + 轨迹合并）/ stop（取消标记） | 组合工厂 |
| `canvas-layers.tsx` | 398 | 画布图层组件：ScopeNavigationBar / ScopeHeader / AppScopeContent / ContainerResizeControls | React 组件 |

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

### 4. 组合工厂（scope-camera / scope-navigation）

一组互相调用的操作由单个工厂一次创建并整体返回，内部自由组合：

```tsx
const cameraOps = createScopeCameraOps(scopeCameraDeps);
const { setScopeCamera, fitScope, centerScopeAtScale } = cameraOps;
```

**不要用 useMemo 固定 ops 身份**——React Compiler 会对"返回多个闭包的 memo"
报 `Compilation Skipped`。消费方按既有模式处理：事件回调直接用（每次渲染
重新组装没问题），effect 则经 `actionRefs` 读取（键盘监听器因此只挂载一次，
不再随函数身份反复解绑重挂）。

### TDZ 规避

deps 中若引用组件后段才声明的函数（如 `updateInputBinding`），
用箭头函数惰性转发，不要直接引用：

```tsx
updateInputBinding: (nodeId, portId, value) => updateInputBinding(nodeId, portId, value),
```

## page.tsx 剩余结构（约 1860 行）

| 区段 | 说明 |
|---|---|
| 状态声明 | useState/useRef 集中区（含 actionRefs 快捷键动作表、exportDocument） |
| 当前作用域派生 | 主 JSX 条件渲染标志（scopeMinimized/isBusinessScope/navigationStack 等） |
| 布局投影持久化 | 位置/尺寸写入 surface.projections |
| 各族 deps 组装 | scopeCamera/scopeNavigation/documentIO/businessRun 等 + 工厂调用 |
| 撤销/重做 | history/future 双栈 |
| 面板导航与绑定更新 | emit、selectPanelBusinessNode、updateInputBinding/updateOutputBinding |
| 主 JSX 骨架 | 条件渲染矩阵已组件化：5 个守卫条件各对应一个图层组件（见下） |

主 JSX 现在的条件矩阵（每个分支一行守卫 + 一个组件）：

```tsx
{!scopeMinimized && navigationStack.length > 1 && <ScopeNavigationBar … />}
<ScopeHeader … />                       {/* 内部处理三态 */}
{!scopeMinimized && isBusinessScope && <BusinessScopeLayer … />}
{!scopeMinimized && !isBusinessScope && <AppScopeContent … />}
{!scopeMinimized && !layoutLocked && <ContainerResizeControls … />}
```

## 后续可选拆分（收益递减，按需进行）

- 布局投影持久化（约 300 行：storeNodeProjection/storeScopeCanvasProjection 等）：
  多个 useCallback 与状态 setter 交织，收益一般——这是最后一块成规模的存量

## 验证基线

改动后须通过：

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json        # 0 错误
./node_modules/.bin/eslint app/page.tsx app/editor/       # 恰好 2 errors + 1 warning（项目既有问题）
./node_modules/.bin/esbuild app/page.tsx --loader:.tsx=tsx --jsx=transform --outfile=/dev/null
```

既有问题清单（不要新增，也暂不修）：setState-in-effect ×1、
渲染期写 actionRefs ×1、未使用的 eslint-disable ×1。

历史注记：曾有的两条 exhaustive-deps 警告（calculateFitCamera 漏 scopeNode、
键盘 effect 漏 exportDocument）已在导航族拆分中随 actionRefs 改造消除。
