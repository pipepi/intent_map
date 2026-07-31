// ============================================================================
// 泳道自动布局（page.tsx 拆出）
// ----------------------------------------------------------------------------
// 按节点 implementation.config.lane（runtime/interface/output）分三条泳道，
// 每道按固定列 x 坐标自上而下堆叠（贪婪放入当前最矮的列）。
//
// computeLaneAutoLayout 是纯函数：只读节点树，返回投影布局表 + 画布框架，
// 不涉及 React 状态。page.tsx 的薄封装负责把结果 commitView 写入 surface
// 并触发 fitScope 适应视图。
//
// 泳道几何（与画布默认 2400 宽度配套）：
//   runtime    单 列 x=90                   —— 运行时/逻辑节点
//   interface  三 列 x=500 / 950 / 1400     —— 界面节点（主力泳道）
//   output     单 列 x=1880                 —— 输出节点
// ============================================================================

import type { IntentNode, NodeProjectionLayout } from "../runtime/model";
import { runtimeNodeRenderSize } from "../runtime/node-renderer";
import { defaultNodeProjectionLayout } from "../runtime/projection";

/** 泳道列 x 坐标表：键为 lane 名，值为该泳道各列的 x 坐标 */
const LANE_COLUMNS: Record<string, number[]> = {
  runtime: [90],
  interface: [500, 950, 1400],
  output: [1880],
};

/** 节点纵向堆叠间距 */
const LANE_GAP = 48;

/** 布局后画布的最小宽度（与泳道最右列 1880 + 节点宽配套） */
const CANVAS_MIN_WIDTH = 2400;

/** 布局后画布的最小高度 */
const CANVAS_MIN_HEIGHT = 1500;

export interface LaneAutoLayoutResult {
  /** 节点 id → 投影布局（不含作用域自身） */
  nodeLayouts: Record<string, NodeProjectionLayout>;
  /** 作用域画布自身的布局（frame 已撑到至少 2400×内容高度） */
  canvasLayout: NodeProjectionLayout;
}

/**
 * 计算泳道自动布局。
 * @param scope       当前作用域节点（读取其 children 与默认画布布局）
 * @param worldWidth  当前画布世界宽度（结果宽度取 max(worldWidth, 2400)）
 */
export const computeLaneAutoLayout = (
  scope: IntentNode,
  worldWidth: number,
): LaneAutoLayoutResult => {
  // 每列当前已堆到的 y 高度（起始 80 为画布顶部留白）
  const laneHeights: Record<string, number[]> = {
    runtime: [80],
    interface: [80, 80, 80],
    output: [80],
  };
  let maximumBottom = 0;
  const nodeLayouts = Object.fromEntries(
    (scope.children ?? []).map((node) => {
      const lane = String(
        node.implementation?.config?.lane ?? "interface",
      );
      const columns = LANE_COLUMNS[lane] ?? LANE_COLUMNS.interface;
      const heights = laneHeights[lane] ?? laneHeights.interface;
      const size = runtimeNodeRenderSize(node);
      // 贪婪策略：放入当前最矮的列
      const column = heights.indexOf(Math.min(...heights));
      const x = columns[column];
      const y = heights[column];
      heights[column] += size.height + LANE_GAP;
      maximumBottom = Math.max(maximumBottom, y + size.height + 80);
      return [
        node.id,
        defaultNodeProjectionLayout({
          ...node,
          position: { x, y },
        }),
      ];
    }),
  );
  const canvasLayout = {
    ...defaultNodeProjectionLayout(scope),
    frame: {
      x: 0,
      y: 0,
      width: Math.max(worldWidth, CANVAS_MIN_WIDTH),
      height: Math.max(CANVAS_MIN_HEIGHT, maximumBottom),
    },
  };
  return { nodeLayouts, canvasLayout };
};
