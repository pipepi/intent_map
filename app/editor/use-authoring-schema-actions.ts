"use client";

import {
  renameIntentNodeId,
  updateIntentPortSchema,
} from "../runtime/authoring";
import type {
  Expression,
  IntentDocumentV3,
  IntentNode,
} from "../runtime/model";
import { findPath, uid } from "./tree-utils";

export interface AuthoringSchemaActionDeps {
  documentState: IntentDocumentV3;
  businessRoot: IntentNode;
  commitDocumentChange: (next: IntentDocumentV3) => void;
  updateDocumentNode: (
    id: string,
    updater: (node: IntentNode) => IntentNode,
  ) => void;
  setToast: (message: string) => void;
}

export function useAuthoringSchemaActions({
  documentState,
  businessRoot,
  commitDocumentChange,
  updateDocumentNode,
  setToast,
}: AuthoringSchemaActionDeps) {
  const renameBusinessNode = (nodeId: string, nextId: string) => {
    const result = renameIntentNodeId(documentState.rootIntent, nodeId, nextId);
    if (!result.ok) {
      setToast(`修改失败：${result.error}`);
      return;
    }
    commitDocumentChange({
      ...documentState,
      businessRootId:
        documentState.businessRootId === nodeId
          ? nextId
          : documentState.businessRootId,
      rootIntent: result.value,
      workspaceState: {
        ...documentState.workspaceState,
        panels: documentState.workspaceState.panels.map((panel) => ({
          ...panel,
          selection: {
            ...panel.selection,
            nodeIds: panel.selection.nodeIds.map((id) =>
              id === nodeId ? nextId : id,
            ),
            primaryNodeId:
              panel.selection.primaryNodeId === nodeId
                ? nextId
                : panel.selection.primaryNodeId,
          },
        })),
      },
    });
    setToast(`节点 ID 已更新为 ${nextId}`);
  };

  const editPortSchema = (
    node: IntentNode,
    direction: "inputs" | "outputs",
    portId: string,
    next: IntentNode["inputs"][number] | null,
  ) => {
    const result = updateIntentPortSchema(
      documentState.rootIntent,
      node.id,
      direction,
      portId,
      next,
    );
    if (!result.ok) {
      setToast(
        `端口修改失败：${result.error}${
          result.references?.length ? `（${result.references.join("、")}）` : ""
        }`,
      );
      return;
    }
    commitDocumentChange({ ...documentState, rootIntent: result.value });
    setToast(next ? `端口「${next.name}」已更新` : `端口「${portId}」已删除`);
  };

  const addPortSchema = (
    node: IntentNode,
    direction: "inputs" | "outputs",
  ) => {
    const port = {
      id: uid(direction === "inputs" ? "input" : "output"),
      name: direction === "inputs" ? "新输入" : "新输出",
      type: "any" as const,
      channel: "data" as const,
    };
    updateDocumentNode(node.id, (item) => ({
      ...item,
      [direction]: [...item[direction], port],
    }));
    setToast(`已新增${direction === "inputs" ? "输入" : "输出"}端口`);
  };

  const movePortSchema = (
    node: IntentNode,
    direction: "inputs" | "outputs",
    index: number,
    offset: -1 | 1,
  ) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= node[direction].length) return;
    updateDocumentNode(node.id, (item) => {
      const ports = [...item[direction]];
      [ports[index], ports[nextIndex]] = [ports[nextIndex], ports[index]];
      return { ...item, [direction]: ports };
    });
  };

  const parentScopeFor = (nodeId: string) =>
    findPath(businessRoot, nodeId)?.at(-2) ?? businessRoot;

  const bindingOptionsFor = (nodeId: string) => {
    const parent = parentScopeFor(nodeId);
    return [
      ...parent.inputs.map((input) => ({
        value: `env:${input.id}`,
        label: `环境 · ${input.name}`,
      })),
      ...(parent.children ?? [])
        .filter((child) => child.id !== nodeId)
        .flatMap((child) =>
          child.outputs.map((output) => ({
            value: `ref:${child.id}:${output.id}`,
            label: `${child.name} · ${output.name}`,
          })),
        ),
    ];
  };

  const expressionForBindingValue = (value: string): Expression | undefined => {
    if (value.startsWith("env:")) {
      return { kind: "ref", portId: value.slice(4), env: true };
    }
    if (value.startsWith("ref:")) {
      const [, nodeId, portId] = value.split(":");
      return { kind: "ref", nodeId, portId };
    }
  };

  const updateInputBinding = (nodeId: string, portId: string, value: string) => {
    const binding = expressionForBindingValue(value);
    updateDocumentNode(nodeId, (node) => ({
      ...node,
      inputs: node.inputs.map((input) =>
        input.id === portId ? { ...input, binding } : input,
      ),
    }));
    setToast(binding ? "管道已连接或改绑" : "管道已断开");
  };

  const outputBindingOptionsFor = (node: IntentNode) => [
    ...node.inputs.map((input) => ({
      value: `env:${input.id}`,
      label: `输入 · ${input.name}`,
    })),
    ...(node.children ?? []).flatMap((child) =>
      child.outputs.map((output) => ({
        value: `ref:${child.id}:${output.id}`,
        label: `${child.name} · ${output.name}`,
      })),
    ),
  ];

  const updateOutputBinding = (nodeId: string, portId: string, value: string) => {
    const binding = expressionForBindingValue(value);
    updateDocumentNode(nodeId, (node) => ({
      ...node,
      outputs: node.outputs.map((output) =>
        output.id === portId ? { ...output, binding } : output,
      ),
    }));
  };

  return {
    renameBusinessNode,
    editPortSchema,
    addPortSchema,
    movePortSchema,
    bindingOptionsFor,
    updateInputBinding,
    outputBindingOptionsFor,
    updateOutputBinding,
  };
}
