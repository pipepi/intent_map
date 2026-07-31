// ============================================================================
// 画布交互常量（page.tsx 拆出）
// ============================================================================

export const MIN_SCALE = 0.5;              // 相机缩放下限（缩到最小再滚轮 = 返回上级）
export const MAX_SCALE = 2;                // 相机缩放上限（放到最大再滚轮 = 进入最近节点）
export const NODE_MIN_SIZE = { width: 220, height: 140 };   // 应用节点最小尺寸
export const NODE_MAX_SIZE = { width: 1200, height: 900 };  // 应用节点最大尺寸
export const ROOT_CANVAS_MIN_SIZE = { width: 640, height: 420 };   // 作用域画布最小尺寸
export const ROOT_CANVAS_MAX_SIZE = { width: 8000, height: 6000 }; // 作用域画布最大尺寸
export const ROOT_CANVAS_PADDING = 40;     // 缩放画布时内容四周保留的最小留白
export const FIT_VIEW_PADDING = 56;        // "适应视图"时视口边缘留白
export const PORT_ROW = 26;                // 应用域边界端口每行高度（纵向排列间距）
export const PORT_TOP = 65;                // 应用域第一个端口距容器顶部的偏移
