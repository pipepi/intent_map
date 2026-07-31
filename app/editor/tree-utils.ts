// ============================================================================
// 节点树通用工具（page.tsx 拆出）
//   - ID 生成 / 深拷贝 / 树查找
//   - 不可变树操作（所有文档修改都走纯函数返回新树，配合 React state 使用）
//   - 节点显示属性默认值
//   - 自由布局面板的浏览上下文恢复
// ============================================================================

import {
  ACTIVE_BUSINESS_SCOPE_REF_ID,
  createApplicationDocument,
  type IntentDocumentV3,
  type IntentNode,
  type ScopeAddress,
} from "../runtime/model";
import { createSampleBusinessRoot } from "../runtime/sample-business-tree";

/** 生成短随机 ID（随机串 + 时间戳尾，前缀标识用途，如 intent_/node_/linked_）。 */
export const uid = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

/** 内置示例文档：以示例业务树为内容创建一份完整的应用文档。 */
export const sampleDocument = () =>
  createApplicationDocument(createSampleBusinessRoot());

/** 深拷贝（文档数据为纯 JSON，无函数/循环引用，可用 JSON 往返实现）。 */
export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 在节点树中按 id 深度优先查找节点。 */
export const findNode = (node: IntentNode, id: string): IntentNode | undefined => {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
};

/** 查找从根到目标节点的完整路径（含两端），找不到返回 null。 */
export const findPath = (node: IntentNode, id: string, path: IntentNode[] = []): IntentNode[] | null => {
  const next = [...path, node];
  if (node.id === id) return next;
  for (const child of node.children ?? []) {
    const found = findPath(child, id, next);
    if (found) return found;
  }
  return null;
};

/**
 * 从文档的"自由布局面板"（panel-free-layout）恢复上下文：
 * 该面板的 current-container surface 持久化了用户上次的钻取路径
 * （navigationStack）、当前作用域和选中节点，用于新建/导入文档后
 * 还原到上次浏览的位置。若面板里没有容器记录，则默认落到业务根，
 * 并保证栈底始终是应用根节点。
 */
export const freePanelContext = (document: IntentDocumentV3) => {
  const panel = document.workspaceState.panels.find(
    (candidate) => candidate.id === "panel-free-layout",
  );
  const candidate = panel?.surfaces.find(
    (surface) => surface.id === panel.activeContainerSurfaceId,
  );
  const container =
    candidate?.kind === "current-container" ? candidate : undefined;
  const addresses: ScopeAddress[] = container
    ? [...container.navigationStack]
    : [
        {
          domain: "business",
          nodeId: document.businessRootId,
          viaReferenceId: ACTIVE_BUSINESS_SCOPE_REF_ID,
        },
      ];
  if (addresses[0]?.nodeId !== document.rootIntent.id) {
    addresses.unshift({ domain: "app", nodeId: document.rootIntent.id });
  }
  return {
    navigationStack: addresses,
    scopeId: container?.scope.nodeId ?? document.businessRootId,
    selectionId:
      panel?.selection.primaryNodeId ?? document.businessRootId,
  };
};

/** 不可变更新：对树中 id 匹配的节点应用 updater，返回新树。 */
export const updateNode = (
  node: IntentNode,
  id: string,
  updater: (target: IntentNode) => IntentNode,
): IntentNode => {
  if (node.id === id) return updater(node);
  return {
    ...node,
    children: node.children?.map((child) => updateNode(child, id, updater)),
  };
};

/** 不可变删除：从整棵树中移除 id 节点（含其子树），返回新树。 */
export const removeNode = (node: IntentNode, id: string): IntentNode => ({
  ...node,
  children: node.children
    ?.filter((child) => child.id !== id)
    .map((child) => removeNode(child, id)),
});

/** 节点渲染尺寸（无显式 size 时用默认值）。 */
export const nodeSize = (node: IntentNode) => node.size ?? { width: 320, height: 220 };

/** 节点缩放模式：simple = 右/下/右下三向；full = 四边四角八向。 */
export const nodeResizeMode = (node: IntentNode) => node.resizeMode ?? "simple";
