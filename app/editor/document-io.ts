// ============================================================================
// 文档加载 / 导入 / 导出（page.tsx 拆出）
// ----------------------------------------------------------------------------
// v3 JSON 与 .pip 种子两种文档格式的读写族：
//
//   applyLoadedDocument   应用一份已加载的文档：进撤销历史、还原持久化的
//                         浏览位置（面板/导航栈）、派发 DOCUMENT_LOADED、清脏
//   exportPip             导出 .pip 种子：文档序列化后与 Loader 源码、
//                         清单一起打包下载
//   loadPipBytes          解码 .pip 字节并在隔离 Worker 中运行 Loader；
//                         requireConfirmation=true（手动导入）时先弹确认框
//                         （SHA-256 只能校验完整性，不能证明发布者可信）
//   importDocument        文件导入入口：按扩展名分派 .pip（走 Loader）
//                         或 .json（直接解析），最后清空 input 值允许重复导入
//
// 注意：exportDocument（v3 JSON 导出）仍留在 page.tsx——它定义在状态声明区，
// 被键盘 effect 以首渲染闭包引用（只依赖稳定 setter + 显式传入的文档，
// 过期闭包无副作用），搬迁需前置整族，收益不抵成本。
// ============================================================================

import type { ChangeEvent } from "react";

import {
  loadIntentDocument,
  serializeIntentDocument,
  type IntentDocumentV3,
  type JsonValue,
  type ScopeAddress,
} from "../runtime/model";
import {
  DEFAULT_PIP_LOADER_SOURCE,
  decodePip,
  encodePip,
  runPipLoader,
} from "../runtime/pip";

import { freePanelContext } from "./tree-utils";
import { downloadBytes } from "./download";

/** 文档 IO 族所需的外部依赖（page.tsx 每次渲染组装）。 */
export interface DocumentIODeps {
  /** 当前文档（applyLoadedDocument 进历史、exportPip 序列化用） */
  documentState: IntentDocumentV3;
  /**
   * 加载一份文档（useDocumentHistory.loadDocument）：把当前文档压入撤销栈
   * （不截断上限）、替换文档并清脏——忠实还原原 applyLoadedDocument 语义。
   */
  loadDocument: (next: IntentDocumentV3) => void;
  /** 运行时事件派发（DOCUMENT_LOADED） */
  dispatchRuntimeEvent: (
    type: string,
    source: string,
    payload?: Record<string, JsonValue>,
  ) => void;
  /** 导航栈（还原持久化的浏览位置） */
  setNavigationStack: (next: ScopeAddress[]) => void;
  /** 标记文档为干净（导出成功后） */
  markClean: () => void;
  setToast: (message: string) => void;
}

export interface DocumentIOOps {
  applyLoadedDocument: (loaded: IntentDocumentV3) => void;
  exportPip: () => Promise<void>;
  loadPipBytes: (
    bytes: ArrayBuffer,
    requireConfirmation: boolean,
  ) => Promise<IntentDocumentV3>;
  importDocument: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

/** 创建文档 IO 族操作（loadPipBytes 供 Rust 宿主引导 effect 复用）。 */
export function createDocumentIO(deps: DocumentIODeps): DocumentIOOps {
  const {
    documentState,
    loadDocument,
    dispatchRuntimeEvent,
    setNavigationStack,
    markClean,
    setToast,
  } = deps;

  const applyLoadedDocument = (loaded: IntentDocumentV3) => {
    const restored = freePanelContext(loaded);
    loadDocument(loaded);
    dispatchRuntimeEvent("DOCUMENT_LOADED", "document_loader", {
      scopeId: restored.scopeId,
      selectionId: restored.selectionId,
    });
    setNavigationStack(restored.navigationStack);
  };

  const exportPip = async () => {
    try {
      const now = new Date();
      const releaseDate = now.toISOString().slice(0, 10).replaceAll("-", "");
      const bytes = await encodePip({
        manifest: {
          packageId: "intent-map.document",
          layer: "a5",
          artifactName: "intent_map_document",
          name: "Intent Map",
          packageVersion: "0.1.0",
          releaseDate,
          rootNodeId: documentState.rootIntent.id,
          loaderAbi: "pip-loader/1",
          requiredCapabilities: [],
          createdAt: now.toISOString(),
          contentType: "application/vnd.intent-map.pip",
        },
        loaderSource: DEFAULT_PIP_LOADER_SOURCE,
        rootTreeText: serializeIntentDocument(documentState),
        assets: [],
      });
      downloadBytes(
        `a5_intent_map_document_0_1_0_${releaseDate}.pip`,
        bytes,
        "application/vnd.intent-map.pip",
      );
      markClean();
      setToast("PIP 种子已导出");
    } catch (error) {
      setToast(error instanceof Error ? `PIP 导出失败：${error.message}` : "PIP 导出失败");
    }
  };

  const loadPipBytes = async (
    bytes: ArrayBuffer,
    requireConfirmation: boolean,
  ): Promise<IntentDocumentV3> => {
    const pip = await decodePip(bytes);
    if (
      requireConfirmation &&
      !window.confirm(
        `“${pip.manifest.name}”包含 JavaScript Loader。SHA-256 只能验证完整性，不能证明发布者可信。是否在隔离 Worker 中运行？`,
      )
    ) {
      throw new Error("用户取消运行 PIP Loader");
    }
    const parsed = await runPipLoader(
      pip.loaderSource,
      pip.manifest,
      pip.rootTreeText,
    );
    return loadIntentDocument(parsed);
  };

  const importDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const loaded = file.name.toLowerCase().endsWith(".pip")
        ? await loadPipBytes(await file.arrayBuffer(), true)
        : loadIntentDocument(JSON.parse(await file.text()) as unknown);
      applyLoadedDocument(loaded);
      setToast("文档已在临时状态校验并加载");
    } catch (error) {
      setToast(error instanceof Error ? `导入失败：${error.message}` : "导入失败");
    } finally {
      event.target.value = "";
    }
  };

  return { applyLoadedDocument, exportPip, loadPipBytes, importDocument };
}
