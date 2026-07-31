"use client";

import { useEffect, useState } from "react";

import type { PendingPipeState } from "./business-ops";

export interface EditorSelectionCapability {
  selectedAppNodeId: string;
  selectedBusinessNodeId: string;
  selectedEdgeId: string | null;
  onSelectAppNode: (id: string) => void;
  onSelectBusinessNode: (id: string) => void;
  setSelectedEdgeId: (id: string | null) => void;
}

export function useEditorUiSession() {
  const [appNodeId, selectAppNode] = useState("current_container");
  const [edgeId, selectEdge] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [legendOpen, setLegendOpen] = useState(false);
  const [pendingPipe, setPendingPipe] = useState<PendingPipeState>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return {
    selection: {
      appNodeId,
      edgeId,
      selectAppNode,
      selectEdge,
      bindBusiness(
        businessNodeId: string,
        selectBusinessNode: (id: string) => void,
      ): EditorSelectionCapability {
        return {
          selectedAppNodeId: appNodeId,
          selectedBusinessNodeId: businessNodeId,
          selectedEdgeId: edgeId,
          onSelectAppNode: selectAppNode,
          onSelectBusinessNode: selectBusinessNode,
          setSelectedEdgeId: selectEdge,
        };
      },
    },
    workspace: { search, setSearch },
    pipe: { pending: pendingPipe, setPending: setPendingPipe },
    legend: {
      open: legendOpen,
      toggle: () => setLegendOpen((open) => !open),
      close: () => setLegendOpen(false),
    },
    feedback: {
      toast,
      show: setToast,
      dismiss: () => setToast(""),
      setToast,
    },
  };
}

export type EditorUiSession = ReturnType<typeof useEditorUiSession>;
