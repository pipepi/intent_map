"use client";

import type { ReactNode } from "react";

import type { IntentDocumentV2, IntentNode, JsonValue } from "./model";

export type RuntimeCommand = {
  type: string;
  payload?: Record<string, JsonValue>;
  source?: string;
};

export type RuntimeRendererProps = {
  node: IntentNode;
  document: IntentDocumentV2;
  scale: number;
  active: boolean;
  selected: boolean;
  summary: boolean;
  emit: (command: RuntimeCommand) => void;
};

export type RuntimeRenderer = (props: RuntimeRendererProps) => ReactNode;

const summaryRenderer =
  (eyebrow: string, detail: string): RuntimeRenderer =>
  function SummaryRenderer({ node }) {
    return (
      <div className="runtime-summary">
        <span>{eyebrow}</span>
        <strong>{node.name}</strong>
        <small>{detail}</small>
      </div>
    );
  };

const builtInRenderers: Record<string, RuntimeRenderer> = {
  "application-root": summaryRenderer("ROOT", "全屏节点运行时"),
  "intent-document-loader": summaryRenderer("LOADER", "v1 / v2 文档加载与迁移"),
  "application-state": summaryRenderer("STATE", "作用域、选择与布局快照"),
  "event-clock": summaryRenderer("EVENT", "离散事务批次"),
  "command-processor": summaryRenderer("ACTION", "确定性命令归约"),
  "intent-executor": summaryRenderer("EXECUTOR", "本地业务 DAG 执行"),
  "global-toolbar": summaryRenderer("VIEW", "全局文档与运行命令"),
  "intent-tree": summaryRenderer("VIEW", "递归业务意图导航"),
  "module-library": summaryRenderer("VIEW", "不可变模块快照"),
  "validation": summaryRenderer("VIEW", "类型、作用域与依赖校验"),
  "breadcrumb": summaryRenderer("VIEW", "当前作用域路径"),
  "scope-toolbar": summaryRenderer("VIEW", "当前作用域控制"),
  "current-container": summaryRenderer("RENDERER", "稳定 scopeId 投影"),
  "canvas-status": summaryRenderer("VIEW", "管道和交互状态"),
  "properties": summaryRenderer("VIEW", "节点属性与端口绑定"),
  "run-trace": summaryRenderer("VIEW", "根输入与分层追踪"),
};

export const rendererRegistry = Object.freeze(builtInRenderers);

export const resolveRenderer = (node: IntentNode): RuntimeRenderer => {
  const key = node.implementation?.key;
  if (!key) return summaryRenderer(node.kind.toUpperCase(), node.description);
  return (
    rendererRegistry[key] ??
    summaryRenderer("UNKNOWN", `未注册的内置实现：${key}`)
  );
};

export const isRegisteredImplementation = (key: string): boolean =>
  Object.hasOwn(rendererRegistry, key);

export const REGISTERED_IMPLEMENTATION_KEYS = Object.freeze(
  Object.keys(rendererRegistry),
);
