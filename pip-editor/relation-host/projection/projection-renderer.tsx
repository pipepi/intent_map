/** Bridges pure projection data into a plugin Web Component and routes its requests back to the host. */
import { createElement, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Relation, RelationGraph, RelationNode } from "../../relation/index.ts";
import type { ElementContext, ProjectionContext, RelationElementRequest, WorkspaceWindowFrame } from "../contracts/package-types.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import { resolveNodePresentation } from "./resolve-presentation.ts";
import styles from "../view/relation-host.module.css";

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

function PluginProjection({ tag, context, onRequest, children }: { tag: string; context: ElementContext; onRequest: (request: RelationElementRequest) => void; children?: ReactNode }) {
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    const current = host.current as (HTMLElement & { context?: ElementContext }) | null;
    if (!current) return;
    current.context = {
      ...structuredClone({
        workspaceId: context.workspaceId,
        rootNodeIds: context.rootNodeIds,
        workspaceView: context.workspaceView,
        graph: context.graph,
        node: context.node,
        relation: context.relation,
        selection: context.selection,
        projection: context.projection,
        projectionNode: context.projectionNode,
        observedNode: context.observedNode,
        projectionContext: context.projectionContext,
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
  return createElement(tag, { ref: host }, children);
}

export function RelationNodeRenderer({ workspaceId, rootNodeIds, workspaceView, graph, node, selection, purpose = "node", projectionContext, elements, nodeTypes, onRequest }: {
  workspaceId: string; rootNodeIds: string[]; workspaceView: import("../../relation/index.ts").JsonValue;
  graph: RelationGraph; node: RelationNode; selection: string[]; purpose?: "node" | "workspace";
  projectionContext?: ProjectionContext;
  elements: ElementPluginRegistry; nodeTypes: NodeTypePluginRegistry;
  onRequest: (request: RelationElementRequest) => void;
}) {
  const { type, projection, projectionData, declaration, error, observed, context: contextKind } = resolveNodePresentation(
    node, graph, elements, nodeTypes, purpose, { workspaceId, rootNodeIds, workspaceView, selection, projectionContext },
  );
  const context = useMemo<ElementContext>(() => ({
    workspaceId, rootNodeIds, workspaceView, graph, node, projectionNode: node, observedNode: observed, projectionContext: contextKind, typeDescriptor: type, selection,
    projection: projection ? { id: projection.id, data: projectionData ?? null } : undefined,
  }), [workspaceId, rootNodeIds, workspaceView, graph, node, observed, contextKind, type, selection, projection, projectionData]);
  if (error) return <div className={styles.orphan}><div className={styles.nodeHeading}><strong>{node.id}</strong><span>projection error</span></div><p>{error}</p><RawRelations relations={node.relations} /></div>;
  if (declaration) return <PluginProjection tag={declaration.tag} context={context} onRequest={onRequest}>
    {contextKind?.kind === "children-workspace" && <EmbeddedItems data={projectionData} workspaceId={workspaceId} rootNodeIds={rootNodeIds} workspaceView={workspaceView} graph={graph} selection={selection} elements={elements} nodeTypes={nodeTypes} onRequest={onRequest} />}
  </PluginProjection>;
  return <div className={styles.orphan}>
    <div className={styles.nodeHeading}><strong>{node.id}</strong><span>{type?.name ?? "orphan RelationNode"}</span></div>
    <RawRelations relations={node.relations} />
  </div>;
}

function EmbeddedItems({ data, workspaceId, rootNodeIds, workspaceView, graph, selection, elements, nodeTypes, onRequest }: {
  data: import("../../relation/index.ts").JsonValue | undefined; workspaceId: string; rootNodeIds: string[];
  workspaceView: import("../../relation/index.ts").JsonValue; graph: RelationGraph; selection: string[];
  elements: ElementPluginRegistry; nodeTypes: NodeTypePluginRegistry; onRequest: (request: RelationElementRequest) => void;
}) {
  const items = data && typeof data === "object" && !Array.isArray(data) && Array.isArray(data.items) ? data.items : [];
  return <>{items.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const projectionNodeId = typeof raw.projectionNodeId === "string" ? raw.projectionNodeId : "", frame = raw.frame as WorkspaceWindowFrame;
    const node = graph.nodes[projectionNodeId]; if (!node || !frame) return [];
    return [<article key={projectionNodeId} data-embedded-projection={projectionNodeId} style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}>
      <RelationNodeRenderer workspaceId={workspaceId} rootNodeIds={rootNodeIds} workspaceView={workspaceView} graph={graph} node={node} selection={selection}
        purpose="workspace" projectionContext={{ kind: "self-embedded", parentProjectionNodeId: String(raw.parentProjectionNodeId ?? ""), frame }} elements={elements} nodeTypes={nodeTypes} onRequest={onRequest} />
    </article>];
  })}</>;
}
