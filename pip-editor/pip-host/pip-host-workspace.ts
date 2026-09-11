/** PipHost 的空白工作区与浏览器下载辅助。 */
import { createCorePipGraph } from "../pip/index.ts";
import { normalizeFreeLayout } from "./workspace/view-state.ts";
import {
  graphFingerprint,
  type WorkspaceSession,
} from "./workspace/workspace-store.ts";

/** 新标签只包含核心 ontology，尚未绑定任何领域 A5。 */
export const createScratchWorkspace = (): WorkspaceSession => {
  const graph = createCorePipGraph();
  return {
    id: crypto.randomUUID(),
    source: { id: "host.new-tab", version: "1", contentSha256: "host" },
    rootNodeIds: [],
    graph,
    views: normalizeFreeLayout({ kind: "free-layout" }, []),
    selection: [],
    scopedSelections: {},
    undo: [],
    redo: [],
    capabilityDiagnostics: [],
    savedGraphFingerprint: graphFingerprint(graph),
  };
};

export const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
