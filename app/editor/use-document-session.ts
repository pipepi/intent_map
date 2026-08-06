"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  serializeIntentDocument,
  type IntentDocumentV3,
  type IntentNode,
  type ScopeAddress,
} from "../runtime/model";
import { downloadExport, prepareDocumentExport } from "../runtime/export";
import {
  ASK_PIP_IO_POLICY,
  type PipIoPolicy,
} from "../runtime/pip-io-policy";
import {
  loadLocalPipIoPolicy,
  saveLocalPipIoPolicy,
} from "../runtime/pip-io-policy-store";
import { createDocumentIO, type PipProjectSession } from "./document-io";
import { useDocumentHistory } from "./use-document-history";
import { useRuntimePipeline } from "./use-runtime-pipeline";
import { freePanelContext, sampleDocument, updateNode } from "./tree-utils";

export function useDocumentSession(setToast: (message: string) => void) {
  const historyState = useDocumentHistory();
  const {
    documentState,
    history,
    future,
    dirty,
    commit,
    view,
    updateDocument,
    checkpoint,
    undo,
    redo,
    loadDocument,
    markClean,
  } = historyState;
  const [navigationStack, setNavigationStack] = useState<ScopeAddress[]>(() =>
    freePanelContext(sampleDocument()).navigationStack,
  );
  const [pipProject, setPipProject] = useState<PipProjectSession | null>(null);
  const [pipIoPolicy, setPipIoPolicy] = useState<PipIoPolicy>(ASK_PIP_IO_POLICY);
  const [localPipIoPolicy, setLocalPipIoPolicy] = useState<PipIoPolicy>(ASK_PIP_IO_POLICY);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const runtime = useRuntimePipeline({ setDocumentState: updateDocument, setToast });

  const commitDocumentChange = useCallback(
    (next: IntentDocumentV3) => {
      commit(next);
      runtime.dispatchRuntimeEvent("DOCUMENT_CHANGED", "document-store");
    },
    [commit, runtime],
  );
  const commitViewChange = useCallback(
    (next: IntentDocumentV3) => {
      view(next);
      runtime.dispatchRuntimeEvent("DOCUMENT_CHANGED", "document-store");
    },
    [runtime, view],
  );
  const updateNodeInDocument = useCallback(
    (id: string, updater: (node: IntentNode) => IntentNode) => {
      commitDocumentChange({
        ...documentState,
        rootIntent: updateNode(documentState.rootIntent, id, updater),
      });
    },
    [commitDocumentChange, documentState],
  );

  const exportDocument = async (source: IntentDocumentV3 = documentState) => {
    const result = await prepareDocumentExport(serializeIntentDocument(source));
    if (!result.ok) {
      setToast(`导出失败：${result.error}`);
      return result;
    }
    downloadExport(result);
    markClean();
    setToast(
      `已导出 ${result.filename} · ${result.byteLength} bytes · SHA-256 ${result.sha256.slice(0, 12)}…`,
    );
    return result;
  };

  const documentIO = createDocumentIO({
    documentState,
    loadDocument,
    dispatchRuntimeEvent: runtime.dispatchRuntimeEvent,
    setNavigationStack,
    markClean,
    setToast,
    pipProject,
    setPipProject,
    pipIoPolicy,
    localPipIoPolicy,
    setPipIoPolicy,
  });

  const savePipIoPolicyAsLocalDefault = async () => {
    try {
      const token = new URLSearchParams(window.location.search).get("token");
      await saveLocalPipIoPolicy(pipIoPolicy, token);
      setLocalPipIoPolicy(pipIoPolicy);
      setToast("当前容量策略已保存为本机默认");
    } catch (error) {
      setToast(error instanceof Error ? `保存本机策略失败：${error.message}` : "保存本机策略失败");
    }
  };

  const newDocument = () => {
    if (
      dirty &&
      !window.confirm("当前文档有未导出的修改，确定要新建并丢弃这些修改吗？")
    ) return;
    const next = sampleDocument();
    setPipProject(null);
    setPipIoPolicy(ASK_PIP_IO_POLICY);
    const restored = freePanelContext(next);
    loadDocument(next, true);
    setNavigationStack(restored.navigationStack);
    runtime.dispatchRuntimeEvent("DOCUMENT_LOADED", "document_loader", {
      scopeId: restored.scopeId,
      selectionId: restored.selectionId,
    });
  };

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    let cancelled = false;
    void loadLocalPipIoPolicy(token)
      .then((policy) => {
        if (!cancelled) setLocalPipIoPolicy(policy);
        return policy;
      })
      .then((policy) => {
        if (!token) return null;
        return fetch(`/__pip/package?token=${encodeURIComponent(token)}`)
          .then((response) => {
            if (!response.ok) throw new Error(`Host 返回 ${response.status}`);
            return response.arrayBuffer();
          })
          .then(async (bytes) => {
            const loaded = await createDocumentIO({
              documentState,
              loadDocument,
              dispatchRuntimeEvent: runtime.dispatchRuntimeEvent,
              setNavigationStack,
              markClean,
              setToast,
              pipProject,
              setPipProject,
              pipIoPolicy,
              localPipIoPolicy: policy,
              setPipIoPolicy,
            }).loadPipBytes(bytes, false);
            return loaded;
          });
      })
      .then((loaded) => {
        if (!loaded || cancelled) return;
        documentIO.applyLoadedDocument(loaded);
        setToast("已从 Rust 种皮加载 PIP 内树");
      })
      .catch((error) => {
        if (!cancelled) {
          setToast(error instanceof Error ? `种皮加载失败：${error.message}` : "种皮加载失败");
        }
      });
    return () => { cancelled = true; };
    // Host bootstrap intentionally runs once for the immutable URL token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    model: {
      document: documentState,
      history,
      future,
      dirty,
      navigationStack,
      pipProject,
      pipIoPolicy,
      localPipIoPolicy,
    },
    writes: {
      commitDocumentChange,
      commitViewChange,
      updateNode: updateNodeInDocument,
      updateTransient: updateDocument,
      checkpoint,
      rawCommit: commit,
      rawView: view,
      loadDocument,
    },
    io: { fileInputRef, exportDocument, newDocument, ...documentIO },
    historyActions: { undo, redo },
    setNavigationStack,
    setPipIoPolicy,
    savePipIoPolicyAsLocalDefault,
    runtime,
  };
}

export type DocumentSession = ReturnType<typeof useDocumentSession>;
