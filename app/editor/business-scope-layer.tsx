// ============================================================================
// 业务作用域图层（page.tsx 拆出）
// ----------------------------------------------------------------------------
// 主 JSX 中 isBusinessScope 为 true 时的整棵业务画布，全部委托给
// runtime/business-graph-projection 的 BusinessGraphProjection 组件。
//
// BusinessScopeLayer 负责把页面级状态与动作"接线"到组件 props：
//   - 选中适配：组件回调给节点对象，页面只存 id（onSelect → selectNode）；
//   - 移动/缩放：工厂的 depth 参数在图层固定为 1（顶层业务节点）；
//   - 断开输入/容器输出：清空绑定后补一条 toast 反馈；
//   - 容器输入连线：复用 startPipeDrag，source 固定为 "environment"。
//
// 注意：必须以组件形式使用（<BusinessScopeLayer {...deps} />），
// 不要当普通函数调用——作为组件 props 传入的回调会被 React 视为
// 事件处理器（延迟执行），否则 startPipeDrag 等含 ref 的工厂闭包
// 会触发 react-hooks/refs 的"渲染期读 ref"误报。
// ============================================================================

import type { ComponentProps, ReactNode } from "react";

import { BusinessGraphProjection } from "../runtime/business-graph-projection";
import type { IntentNode } from "../runtime/model";

import type { PendingPipeState } from "./business-ops";
import type {
  createAddBusinessChild,
  createMoveBusinessNodeStart,
  createResizeBusinessNodeStart,
  createStartPipeDrag,
  createToggleBusinessDisplayMode,
  createToggleBusinessResizeMode,
} from "./business-ops";

type GraphProps = ComponentProps<typeof BusinessGraphProjection>;

/**
 * 业务作用域图层的 props（page.tsx 每次渲染组装成对象后展开传入）。
 * 动作字段直接复用 business-ops 工厂返回函数的签名，避免类型漂移。
 */
export interface BusinessScopeLayerDeps {
  /** 当前业务作用域节点 */
  scope: IntentNode;
  /** 画布世界尺寸 */
  worldSize: GraphProps["worldSize"];
  /** 当前相机缩放（业务画布不随应用域相机平移，只吃缩放） */
  scale: number;
  /** 当前选中的业务节点 id（注意：组件侧类型是 string | undefined，页面组装时用 ?? undefined 适配） */
  selectedNodeId: GraphProps["selectedNodeId"];
  /** 布局锁定（禁止拖拽/缩放） */
  layoutLocked: boolean;
  /** 进行中的连线拖拽状态（null = 未在连线） */
  pendingPipe: PendingPipeState | null;
  /** 选中业务节点（页面侧存 id） */
  selectNode: (nodeId: string) => void;
  /** 双击进入节点 */
  enterNode: GraphProps["onEnter"];
  /** 开始拖拽移动（depth 由图层固定为 1） */
  moveNodeStart: ReturnType<typeof createMoveBusinessNodeStart>;
  /** 开始缩放手势（depth 由图层固定为 1） */
  resizeNodeStart: ReturnType<typeof createResizeBusinessNodeStart>;
  /** 切换缩放模式 */
  toggleResizeMode: ReturnType<typeof createToggleBusinessResizeMode>;
  /** 切换显示模式（最小化⇄展开） */
  toggleDisplayMode: ReturnType<typeof createToggleBusinessDisplayMode>;
  /** 更新输入端口绑定（断开时传空串） */
  updateInputBinding: (nodeId: string, portId: string, value: string) => void;
  /** 更新输出端口绑定（断开时传空串） */
  updateOutputBinding: (nodeId: string, portId: string, value: string) => void;
  /** 操作反馈提示 */
  setToast: (message: string) => void;
  /** 开始连线拖拽 */
  startPipeDrag: ReturnType<typeof createStartPipeDrag>;
  /** 添加业务子意图 */
  addChild: ReturnType<typeof createAddBusinessChild>;
}

/** 业务作用域图层组件（整棵 BusinessGraphProjection，含全部接线适配）。 */
export function BusinessScopeLayer(
  deps: BusinessScopeLayerDeps,
): ReactNode {
  return (
    <BusinessGraphProjection
      projectionId="free-layout-container"
      scope={deps.scope}
      worldSize={deps.worldSize}
      scale={deps.scale}
      selectedNodeId={deps.selectedNodeId}
      layoutLocked={deps.layoutLocked}
      pendingPipe={deps.pendingPipe}
      onSelect={(node) => deps.selectNode(node.id)}
      onEnter={deps.enterNode}
      onMoveStart={(node, event) => deps.moveNodeStart(node, 1, event)}
      onResizeStart={(node, direction, event) =>
        deps.resizeNodeStart(node, direction, 1, event)
      }
      onResizeModeToggle={deps.toggleResizeMode}
      onDisplayModeToggle={deps.toggleDisplayMode}
      onDisconnectInput={(node, port) => {
        deps.updateInputBinding(node.id, port.id, "");
        deps.setToast(`已断开「${node.name} · ${port.name}」的管道`);
      }}
      onStartPipe={deps.startPipeDrag}
      onStartContainerInput={(port, event) =>
        deps.startPipeDrag(deps.scope, port, event, "environment")
      }
      onDisconnectContainerOutput={(port) => {
        deps.updateOutputBinding(deps.scope.id, port.id, "");
        deps.setToast(`已断开当前容器输出「${port.name}」`);
      }}
      onAddChild={deps.addChild}
    />
  );
}
