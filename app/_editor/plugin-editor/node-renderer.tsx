"use client";

import { createElement, useEffect, useMemo, useRef } from "react";
import type { Relation, RelationGraph, RelationNode } from "../../relation/model";
import type { ElementContext, RelationElementRequest } from "./package-types";
import type { ElementPluginRegistry } from "./element-runtime";
import type { NodeTypePluginRegistry } from "./node-type-runtime";
import { resolveNodePresentation } from "./node-presentation";
import styles from "./editor.module.css";

const objectText = (relation: Relation) => relation.object.kind === "const"
  ? JSON.stringify(relation.object.value)
  : relation.object.kind === "ref"
    ? `→ ${relation.object.target.nodeId}/${relation.object.target.relationId}`
    : `${relation.object.op}(…)`;

function RawRelations({ relations, depth = 0 }: { relations: Relation[]; depth?: number }) {
  return <div className={styles.rawRelations}>{relations.map((relation) => <div key={relation.id} style={{ marginLeft: depth * 8 }}>
    <code>{relation.id}</code><span>{objectText(relation)}</span>
    {!!relation.relations.length && <RawRelations relations={relation.relations} depth={depth + 1} />}
  </div>)}</div>;
}

function PluginProjection({ tag, context, onRequest }: { tag: string; context: ElementContext; onRequest: (request: RelationElementRequest) => void }) {
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    const current = host.current as (HTMLElement & { context?: ElementContext }) | null;
    if (!current) return;
    current.context = {
      ...structuredClone({
        workspaceId: context.workspaceId,
        graph: context.graph,
        node: context.node,
        relation: context.relation,
        selection: context.selection,
      }),
      typeDescriptor: context.typeDescriptor ? {
        type: structuredClone(context.typeDescriptor.type),
        name: context.typeDescriptor.name,
        element: context.typeDescriptor.element
          ? structuredClone(context.typeDescriptor.element)
          : undefined,
      } : undefined,
    };
    const listener = (event: Event) => {
      const request = (event as CustomEvent<RelationElementRequest>).detail;
      if (request?.kind) onRequest(request);
    };
    current.addEventListener("intent-relation-request", listener);
    return () => current.removeEventListener("intent-relation-request", listener);
  }, [context, onRequest]);
  // Dynamic custom-element tags require createElement; the ref is only read by the effect above.
  // eslint-disable-next-line react-hooks/refs
  return createElement(tag, { ref: host });
}

export function RelationNodeRenderer({ workspaceId, graph, node, selection, elements, nodeTypes, onRequest }: {
  workspaceId: string; graph: RelationGraph; node: RelationNode; selection: string[];
  elements: ElementPluginRegistry; nodeTypes: NodeTypePluginRegistry;
  onRequest: (request: RelationElementRequest) => void;
}) {
  const { type, declaration } = resolveNodePresentation(node, graph, elements, nodeTypes);
  const context = useMemo<ElementContext>(() => ({ workspaceId, graph, node, typeDescriptor: type, selection }), [workspaceId, graph, node, type, selection]);
  if (declaration) return <PluginProjection tag={declaration.tag} context={context} onRequest={onRequest} />;
  return <div className={styles.orphan}>
    <div className={styles.nodeHeading}><strong>{node.id}</strong><span>{type?.name ?? "orphan RelationNode"}</span></div>
    <RawRelations relations={node.relations} />
  </div>;
}
