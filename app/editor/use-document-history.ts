// ============================================================================
// useDocumentHistory —— 文档历史域 Hook（page.tsx 拆出，useReducer 版）
// ----------------------------------------------------------------------------
// 把 documentState / history / future / dirty 四个状态及全部写操作收进一个
// reducer，让事务性不变量只存在于一处：
//
//   commit(next)      结构级更新：当前文档压入撤销栈（上限 30）→ 清空重做
//                     队列 → 写入 next → 标脏
//   view(next)        视图级更新（commitView 的状态部分）：只写文档 + 标脏，
//                     不进撤销栈（page 的 commitView 包装还会补发
//                     DOCUMENT_CHANGED 事件）
//   update(updater)   函数式直写（原 setDocumentState((active) => …)），
//                     不动撤销栈也不标脏——相机持久化/浏览上下文等用
//   checkpoint()      撤销检查点：拖拽手势在 pointerup 时把拖拽前文档
//                     压栈（文档在手势过程中已被 update 逐步改写）
//   undo / redo       双栈互换；空栈时 no-op；不动 dirty
//   load(next)        加载文档：当前文档压栈（不截断，忠实原行为）→
//                     写入 next → 清脏（导入/新建/重置场景）
//   markClean()       导出成功后清脏
//
// 用法：
//   const { documentState, dirty, commit, view, updateDocument, checkpoint,
//           undo, redo, loadDocument, markClean } = useDocumentHistory();
// ============================================================================

import { useCallback, useReducer } from "react";

import type { IntentDocumentV3 } from "../runtime/model";
import { sampleDocument } from "./tree-utils";

/** 撤销栈上限（与原 [...items.slice(-29), current] 行为一致）。 */
const HISTORY_LIMIT = 30;

export interface DocumentHistoryState {
  document: IntentDocumentV3;
  history: IntentDocumentV3[];
  future: IntentDocumentV3[];
  dirty: boolean;
}

export type DocumentHistoryAction =
  | { type: "commit"; next: IntentDocumentV3 }
  | { type: "view"; next: IntentDocumentV3 | ((active: IntentDocumentV3) => IntentDocumentV3) }
  | { type: "update"; updater: (active: IntentDocumentV3) => IntentDocumentV3 }
  | { type: "checkpoint" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "load"; next: IntentDocumentV3; clearFuture?: boolean }
  | { type: "markClean" };

export function documentHistoryReducer(
  state: DocumentHistoryState,
  action: DocumentHistoryAction,
): DocumentHistoryState {
  switch (action.type) {
    case "commit":
      return {
        document: action.next,
        history: [...state.history.slice(-(HISTORY_LIMIT - 1)), state.document],
        future: [],
        dirty: true,
      };
    case "view":
      return {
        ...state,
        document:
          typeof action.next === "function"
            ? action.next(state.document)
            : action.next,
        dirty: true,
      };
    case "update":
      return { ...state, document: action.updater(state.document) };
    case "checkpoint":
      return {
        ...state,
        history: [...state.history.slice(-(HISTORY_LIMIT - 1)), state.document],
        future: [],
        dirty: true,
      };
    case "undo": {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return {
        ...state,
        document: previous,
        history: state.history.slice(0, -1),
        future: [state.document, ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        document: next,
        history: [...state.history, state.document],
        future: state.future.slice(1),
      };
    }
    case "load":
      return {
        document: action.next,
        history: [...state.history, state.document],
        // 导入文档保留重做队列（忠实原 applyLoadedDocument）；
        // 新建文档传 clearFuture 清空（忠实原 newDocument）。
        future: action.clearFuture ? [] : state.future,
        dirty: false,
      };
    case "markClean":
      return { ...state, dirty: false };
  }
}

export interface DocumentHistory {
  documentState: IntentDocumentV3;
  /** 撤销栈（属性面板等展示"可撤销"状态用） */
  history: IntentDocumentV3[];
  /** 重做队列 */
  future: IntentDocumentV3[];
  /** 有未导出修改（关闭页面前提示） */
  dirty: boolean;
  /** 结构级更新（进撤销历史） */
  commit: (next: IntentDocumentV3) => void;
  /** 视图级更新（不进历史、标脏），支持直传值或函数式 updater；
   *  page 的 commitView = view + DOCUMENT_CHANGED 事件 */
  view: (
    next: IntentDocumentV3 | ((active: IntentDocumentV3) => IntentDocumentV3),
  ) => void;
  /** 函数式直写（不进历史、不标脏） */
  updateDocument: (
    updater: (active: IntentDocumentV3) => IntentDocumentV3,
  ) => void;
  /** 撤销检查点（拖拽手势 pointerup 用） */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  /** 加载文档（进历史、清脏）；clearFuture=true 时同时清空重做队列（新建文档用） */
  loadDocument: (next: IntentDocumentV3, clearFuture?: boolean) => void;
  /** 导出成功后清脏 */
  markClean: () => void;
}

export function useDocumentHistory(): DocumentHistory {
  const [state, dispatch] = useReducer(documentHistoryReducer, undefined, () => ({
    document: sampleDocument(),
    history: [],
    future: [],
    dirty: false,
  }));

  // dispatch 引用稳定，因此全部操作函数用 useCallback 固定身份——下游
  // useCallback / effect 的依赖数组不会因每次渲染而失效重跑。
  const commit = useCallback(
    (next: IntentDocumentV3) => dispatch({ type: "commit", next }),
    [],
  );
  const view = useCallback(
    (next: IntentDocumentV3 | ((active: IntentDocumentV3) => IntentDocumentV3)) =>
      dispatch({ type: "view", next }),
    [],
  );
  const updateDocument = useCallback(
    (updater: (active: IntentDocumentV3) => IntentDocumentV3) =>
      dispatch({ type: "update", updater }),
    [],
  );
  const checkpoint = useCallback(() => dispatch({ type: "checkpoint" }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const loadDocument = useCallback(
    (next: IntentDocumentV3, clearFuture?: boolean) =>
      dispatch({ type: "load", next, clearFuture }),
    [],
  );
  const markClean = useCallback(() => dispatch({ type: "markClean" }), []);

  return {
    documentState: state.document,
    history: state.history,
    future: state.future,
    dirty: state.dirty,
    commit,
    view,
    updateDocument,
    checkpoint,
    undo,
    redo,
    loadDocument,
    markClean,
  };
}
