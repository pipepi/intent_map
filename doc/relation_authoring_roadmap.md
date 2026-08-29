# Relation 编辑与插件创作路线图

## 1. 目的

当前编辑器已经能够通过 A4 Creator 创建节点和 Projection Instance，并由 A3 展示和交互；但还没有形成完整的 Relation 编辑、节点类型创作和节点 UI 元素创作能力。

这些能力横跨 A2 Editor、A3 Node Element、A4 Node Type 和 A5 Node Map，不能一次性按想象建设。本路线采用“消费驱动供应”：先由真实业务场景提出最小需求，再补足恰好能闭环的协议、实现和测试；未被场景消费的能力只记录方向，不提前实现。

## 2. 固定边界

唯一持久化事实保持不变：

```text
RelationGraph
└── RelationNode
    └── Relation[]
```

各层职责保持清晰：

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| A2 Editor | 工作区、手势、坐标、事务、撤销重做、文件与安装授权 | 猜测领域 predicate、绕过 A4 修改语义 |
| A3 Node Element | 节点和投影的视觉、连接锚点、交互反馈 | 决定关系是否合法、直接发布领域类型 |
| A4 Node Type | 类型、predicate、约束、命令、Projection、Creator、验证 | 保存工作区实例和布局 |
| A5 Node Map | 业务节点、关系、Projection Instance、工作区状态 | 携带隐式运行时语义 |

已经安装的 A3/A4 PIP 具有精确版本和内容身份，视为不可变产物。编辑行为产生草稿和新版本，不在原地篡改已安装包。

## 3. 推进原则

### 3.1 场景先于抽象

每项实现必须先有一个可复现的业务故事，至少说明：

- 谁在什么 Projection 和 surface 中操作；
- 操作哪个真实节点或关系；
- 期望生成什么 RelationPatch 或 PIP；
- 如何撤销、重载和验证；
- 哪个现有能力无法完成该故事。

没有上述消费者，不新增公共契约。

### 3.2 最小供应

第一次消费优先实现领域内闭环；出现第二个独立消费者后再抽取共享契约；多个消费者稳定使用后，才固化为宿主平台能力。

```text
第一个消费者：证明闭环
第二个消费者：识别真正共性
多个稳定消费者：固化平台协议
```

### 3.3 逐点披露

每次只披露当前场景需要的一条纵向切片：

```text
业务交互
→ A3 表现入口
→ A2 宿主协调
→ A4 语义决策
→ RelationPatch / 新 PIP
→ 持久化、撤销与重载验证
```

不以“大而全编辑器”为交付单位，也不因未来可能需要而提前加入端口系统、可视化编程语言或任意源码执行。

### 3.4 实例编辑与定义创作分离

Relation Editor 不是新的专用节点类型，而是现有 A2 Editor 对 RelationGraph 实例编辑能力的持续增强。新增、删除、改向和选择 Relation，都发生在用户当前正在观察的业务节点及 Projection 中；A2 协调手势和事务，A3 暴露视觉锚点，A4 提供语义规则，最终修改当前 A5。

Node Type Studio 和 Node Element Studio 不同。它们编辑的不是当前 A5 业务实例，而是可发布的 A4/A3 定义，因此需要专用元类型、草稿节点和 Projection。文件选择、下载、信任确认和包激活仍属于 A2 系统能力。

```text
现有 Relation Editor + 连线能力增强 → 编辑 A5 实例
Node Type Studio 专用节点          → 创作 A4 定义
Node Element Studio 专用节点       → 创作 A3 定义
```

## 4. 当前基线

已具备：

- A4 Creator 创建节点、关系和 Projection Instance；
- RelationPatch 原子提交及图校验；
- 工作区 undo/redo；
- self/children 与 workspace/embedded 正交 Projection；
- `dives-into`、`presents + frame` 语义缩放；
- A3/A4/A5 PIP 导入、安装、打开和 A5 导出；
- A3/A4 精确依赖和内容身份校验。

尚缺：

- 通过可视化手势新增、删除或重新连接 Relation；
- 将上述手势完整集成到现有工作区、Projection、选择和 undo/redo；
- A4 声明可连接端口、端点约束和关系创建规则；
- A3 向宿主暴露连接锚点；
- 可持久化的 A4 节点类型草稿及发布流程；
- 可持久化的 A3 元素草稿、预览及发布流程；
- A3/A4 新版本对现有 A5 的迁移与诊断。

### 4.1 当前 A3 Element 清单

工程当前有 4 个 A3 包、9 个 manifest 级 Element Definition：

| A3 包 | Element | Purpose | 当前用途 |
| --- | --- | --- | --- |
| `official.intent-elements` | `node` | node | Intent 节点摘要 |
| `official.relation-projection-elements` | `properties` | projection | 通用 self 属性 |
|  | `contains` | projection | contains/flow children 组合 |
| `official.scene-elements` | `quadrant` | projection | Scene 单象限 |
|  | `tube` | projection | Scene 管道 |
| `official.spot-terminal-elements` | `terminal` | projection | Terminal Detail |
|  | `terminal-simple` | projection | Terminal Simple |
|  | `composition` | projection | Flow/World Events 组合 |
|  | `fact` | projection | 事实节点 Simple/Detail |

Chart、订单簿、机器人控件等目前只是上述元素的内部组件，不是能被其他 A4 独立发现和选择的 A3 Definition。

当前正式声明只有 `id + tag + purpose`；A4 Projection 只能硬编码一个 `pluginId + elementId`。注册表无法回答元素支持的 surface、视觉角色、输入模型、组合槽位、交互、Relation 锚点、布局约束或预览 fixture。因此这些元素能支持手写 A4，但还不能形成 Node Type Studio 可检索、选择和组合的元素语言。

## 5. 能力地图

以下能力存在明确供应依赖，但每一级内部仍由真实场景逐点触发：A3 Studio 先供应可描述、可组合的视觉能力；A4 Studio 再用这些能力表达节点类型意图；现有 A2 Editor 最后消费 A3 锚点和 A4 关系语义，增强 A5 实例编辑。

### C1 A3 Component Library 与 Definition 协议

消费触发：第一个 Node Type Studio 场景需要按意图寻找合适 A3，或第一个 Node Element Studio 场景需要产出可复用元素。

目标形态类似 Element UI 的组件库：每个组件可独立发现、预览、组合并查阅 API，但运行时保持框架无关和 PIP 可版本化。组件分为三层：

```text
Primitive   Button、Input、Text、Icon、Stack、Grid 等无领域原语
Pattern     Property List、Node Card、Projection Collection、Relation Anchor 等模式
Element     Simple、Detail、Flow、Scene 等可被 A4 Projection 直接引用的根元素
```

Node Element Studio 可以用 Primitive 和 Pattern 构建新的 Pattern 或 Element；Node Type Studio 默认只消费公开给 A4 的 Element，也可在 Element 声明的 slot 内组合获准 Pattern，不能直接编辑 DOM、CSS 或内部原语。

“完备”指每个定义维度完整，不表示预制所有未来业务 UI。A3 PIP 的 RelationDocument 以 Library 为根，所有可独立引用和编辑的定义都必须是典型 RelationNode，而不是隐藏在 manifest 或某个节点 const JSON 中：

```text
LibraryNode       contains → ComponentNode，depends-on → PackageDependencyNode
PackageDependency origin、packageId、version、releaseDate、sha256
ComponentNode     type、level、tag、purpose、role、surface
RuntimeAssetNode  path、mime、sha256；实际字节仍位于 PIP assets
ComponentUseNode  uses → ComponentNode，slot、order、prop-binding
PropNode          name、value-type、default、required、validation
EventNode         name、payload-type、host-intent
SlotNode          name、accepts、cardinality、frame-owner
StateNode         normal、disabled、loading、empty、error 等状态
AnchorNode        port-key、direction、position-policy
LayoutNode        size、resize、zoom-viewport、window-chrome、responsive
ThemeTokenNode    name、value-type、default、override-boundary
PreviewNode       fixture、state、surface、accessibility expectation
```

ComponentNode 通过关系引用 Prop、Event、Slot、State、Anchor、Layout、Token 和 Preview；组合树通过 ComponentUseNode 表达，使同一组件的多次使用、绑定和顺序各自具有稳定身份。manifest 只保留安装入口和快速发现索引；旧 A3 归一化为只含 `id/tag/purpose` 的最小 ComponentNode。

基础能力族按实际消费逐步补齐：

```text
基础呈现：Simple Node、Detail Node、Property List、Status/Value
集合组合：List/Grid、Presented Projection Collection、Free Composition、Flow
交互能力：Field Editor、Action、Selection、Relation Anchor
结构能力：Section、Stack/Grid、Tabs、Empty/Error/Loading
```

组件库必须有目录、分类、搜索、交互预览、Props/Events/Slots API 表和复制/引用示例。A3 负责视图模型和视觉交互；A4 仍负责领域解释、predicate、端点合法性和 RelationPatch。

第一版 Studio 由仓库内固定的 bootstrap A3/A4 元类型承载；它只负责启动自举，不能反向成为所有业务元素的隐式依赖。

暂不供应：脱离真实 Studio 消费的通用 UI DSL、完整设计系统和任意 JavaScript 在线执行。

### C2 Node Element Studio 与 Element Project

消费触发：一个真实节点需要在编辑器内创建或调整 A3 UI，现有元素无法通过配置满足。

候选专用类型包括 element-project、element-definition、element-tree、style-token、interaction-binding 和 relation-anchor，统一位于 `relation.authoring.type.*` 命名空间。

最小供应：浏览组件目录，从 Primitive/Pattern 组合声明式组件树，编辑 props、events、slots、状态、token、数据与命令绑定、锚点和布局；同步生成文档与确定性预览，最后发布完整组件图和 A3 PIP。

暂不供应：任意 JavaScript 编辑、完整 CSS 兼容层、通用设计工具替代品。

### C3 Node Type Studio 与 Node Type Project

消费触发：一个真实领域需要在编辑器内新增或演进 A4 类型，而仓库手写再构建已阻断业务流程。

候选专用类型包括 node-type-project、node-type-definition、relation-definition、projection-definition、creator-definition 和 validator-definition，统一位于 `relation.authoring.type.*` 命名空间。

最小供应：创建草稿、编辑当前场景所需字段、静态诊断、预览生成的 ontology，并按 scope、surface、视觉角色、props、events、slots、交互和布局能力筛选 A3 Element。选定后完成受约束组合，保存 projector→props、event→command 绑定及精确 A3 PIP 依赖，最后封装新版本 A4 PIP。未发布草稿不能进入运行时注册表。

暂不供应：完整 IDE、任意 ESM 在线开发、自动兼容迁移。

### C4 可视化新增 Relation

消费触发：某个真实业务场景需要用户从一个已显示节点拖拽到另一个节点，并生成明确的 predicate。

实现位置：增强现有 Relation Editor，不创建 Relation Editor 节点类型，也不要求用户先打开一个独立工具节点。

最小供应：

- A4 为该场景声明允许的源类型、目标类型和 predicate；
- A3 为相关 Projection 暴露必要锚点；
- A2 管理拖拽、命中、候选反馈和坐标转换；
- 松开后由 A4 command 生成 revision-bound RelationPatch；
- 提交进入既有校验和 undo/redo。

暂不供应：通用端口语言、自动布线、跨工作区连接、多关系批量创建。

### C5 删除、改向与替换 Relation

消费触发：业务场景要求纠正已有关系，而不仅是新增。

最小供应：选中真实 Relation、调用 A4 语义命令、原子删除或替换，并保证嵌套关系和引用闭包合法。

暂不供应：任意图重写语言和复杂批处理。

### C6 多 predicate 选择与基数约束

消费触发：同一对端点在真实场景中存在两个以上合法语义，或出现 one/many 冲突。

最小供应：A4 返回带标签和诊断的候选；A2 只在确有歧义时展示选择器；最终仍由 A4 生成 patch。

暂不供应：没有消费者验证的全局 schema 标准。

### C7 A3/A4 联合演进

消费触发：同一业务变化必须同时升级类型语义和元素表现，并需要便携交付。

最小供应：精确依赖更新、联合校验、按 A3→A4 顺序安装、失败回滚，以及新 A5 导出时携带新闭包。

暂不供应：包市场、远程协作和自动发布渠道。

### C8 A5 迁移

消费触发：已存在的真实 Node Map 无法直接被新版 A4 正确解释。

最小供应：显式迁移命令、迁移前诊断、单次 RelationPatch、撤销或备份策略，以及旧版与新版 fixture。

暂不供应：没有具体版本差异的通用迁移 DSL。

## 6. 首选验证顺序

如果业务场景允许选择，优先用最小纵向闭环降低未知风险：

1. 用真实 Simple 元素披露 A3 Definition，并由 bootstrap 包启动 Node Element Studio；
2. 用第二种元素验证组合、输入、交互和预览契约，抽取必要基础原语；
3. 用真实新类型启动 Node Type Studio，检索并组合已发布 A3；
4. 用第二种节点类型验证 Relation Definition、Projection 与 A3 绑定；
5. 在现有 A2 Editor 中完成单一 predicate 的 Relation 拖拽；
6. 验证删除、撤销、embedded 锚点和语义缩放坐标；
7. 出现真实歧义后再供应多 predicate 与基数选择；
8. 最后打通 A3/A4 联合发布和 A5 迁移。

这只是风险排序。没有对应业务消费时，不因为顺序表存在而启动实现。

## 7. 单点披露文档模板

每个被触发的能力在实现前新增一份短设计记录：

标题使用“`<业务场景> 所需的 <能力点>`”，正文依次记录：消费故事、当前阻断证据、本次最小闭环、A2/A3/A4/A5 各层变化、新增或修改的持久化结构、明确不做的内容、兼容与迁移、测试 fixture、浏览器验收路径，以及是否形成第二消费者与可抽取共性。

实现完成后，记录实际消费反馈；路线图只根据已经发生的反馈调整，不按假设扩张。

## 8. 进入实现的门槛

一个能力点只有同时满足以下条件才进入实现：

- 有确定的业务节点、关系和操作人；
- 有可重复的输入 fixture；
- 能描述预期 RelationPatch 或 PIP 产物；
- 已确认现有 Creator、command 或 Projection 无法完成；
- 能划定本次明确不做的范围；
- 有可执行的自动测试与浏览器验收路径。

不满足门槛时，只保留问题和观察，不扩展宿主公共 API。

## 9. 单点完成标准

每条纵向切片至少满足：

- 业务场景在 UI 中闭环；
- A2/A3/A4 权责没有倒置；
- 所有语义修改通过 A4 产生 RelationPatch；
- undo/redo、导出重载和失败回滚行为明确；
- 旧 A3/A4/A5 包兼容性有测试；
- 控制台无注册、校验或运行时错误；
- 定向测试、全量测试、TypeScript、ESLint、PIP verify 和 self audit 通过；
- 相关系统 PIP 在源码变化后重新封装并审计。

## 10. 当前结论

近期不先增强 A2 连线。等待第一个真实 A3 元素创作场景，以它启动 Node Element Studio；再由真实类型场景启动 Node Type Studio，最后让现有 A2 Editor 消费两者产出的锚点和关系定义，逐步增强 A5 实例编辑。

路线图的价值不是预测全部实现，而是保证每次供应都有明确消费、每次抽象都有重复证据、每次平台扩展都能被实际业务验证。
