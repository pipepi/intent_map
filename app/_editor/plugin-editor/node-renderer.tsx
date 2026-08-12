"use client";

import { createElement, useEffect, useRef } from "react";
import type { ElementPluginRegistry } from "./element-runtime";
import type { ElementReference } from "./package-types";
import type { CanvasNode, NodeTypeDefinition } from "./types";
import styles from "./editor.module.css";

function PluginElement({ reference, value, registry, onValueChange }: { reference: ElementReference; value: string; registry: ElementPluginRegistry; onValueChange?: (key: string, value: string) => void }) {
  const host = useRef<HTMLElement>(null);
  const declaration = registry.resolve(reference.pluginId, reference.elementId);
  useEffect(() => {
    const current = host.current;
    if (!current || !onValueChange) return;
    const listener = (event: Event) => { const detail = (event as CustomEvent<{ field: string; value: string }>).detail; if (detail?.field) onValueChange(detail.field, detail.value); };
    current.addEventListener("intent-value-change", listener);
    return () => current.removeEventListener("intent-value-change", listener);
  }, [onValueChange]);
  if (!declaration) return <div className={styles.imageError}>缺少元素 {reference.pluginId}/{reference.elementId}</div>;
  return createElement(declaration.tag, { ref: host, value, field: reference.sourceField, ...reference.properties });
}

export function NodeRenderer({ node, definition, registry, onValueChange }: { node: CanvasNode; definition?: NodeTypeDefinition; registry: ElementPluginRegistry; onValueChange: (key: string, value: string) => void }) {
  if (!definition) return <div className={styles.orphan}><strong>{node.name}</strong><p>节点类型插件已卸载：{node.type}</p></div>;
  return <>
    <div className={styles.nodeHeading}><strong>{node.name}</strong><span>{definition.displayName}</span></div>
    <div className={styles.preview}>{definition.view.map((reference, index) => <PluginElement key={`${reference.elementId}-${index}`} reference={reference} value={node.values[reference.sourceField] ?? ""} registry={registry} />)}</div>
    <div className={styles.fields}>{definition.fields.map((field) => <PluginElement key={field.key} reference={field.control} value={node.values[field.key] ?? ""} registry={registry} onValueChange={onValueChange} />)}</div>
  </>;
}
