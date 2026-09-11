import { graphNodes } from "../../pip/pip-model.ts";
/** Bridges pure projection data into a plugin Web Component and routes its requests back to the host. */
import { createElement, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Pip } from "../../pip/index.ts";
import type { ElementContext, ExecutionContextSnapshot, ProjectionContextInput, PipElementRequest } from "../contracts/package-types.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import { resolveNodePresentation } from "./resolve-presentation.ts";
import { observationScope, presentedProjections, projectionForInstance } from "./projection-instance.ts";
import styles from "../view/pip-host.module.css";

const objectText = (pip: Pip) => !pip.predicate_value ? "—" : pip.predicate_value.value.kind === "const"
  ? JSON.stringify(pip.predicate_value!.value.value)
  : pip.predicate_value!.value.kind === "ref"
    ? `→ ${pip.predicate_value!.value.target.node_id}/${pip.predicate_value!.value.target.pip_id}`
        : `${pip.predicate_value!.value.op}(…)`;
function RawPips({ pips, depth = 0 }: {
    pips: Pip[];
    depth?: number;
}) {
    return <div className={styles.rawPips}>{pips.map((pip) => <div key={pip.id} style={{ marginLeft: depth * 8 }}>
    <code>{pip.id}</code><span>{objectText(pip)}</span>
    {!!pip.pips.length && <RawPips pips={pip.pips} depth={depth + 1}/>}
  </div>)}</div>;
}
function PluginProjection({ tag, context, onRequest, children }: { tag: string; context: ElementContext; onRequest: (request: PipElementRequest) => void; children?: ReactNode }) {
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
        pip: context.pip,
        selection: context.selection,
        projection: context.projection,
        projectionNode: context.projectionNode,
        observedNode: context.observedNode,
        projectionContext: context.projectionContext,
        execution: context.execution,
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
      const request = (event as CustomEvent<PipElementRequest>).detail;
      if (request?.kind) onRequest(request);
    };
    current.addEventListener("intent-pip-request", listener);
    return () => current.removeEventListener("intent-pip-request", listener);
  }, [context, onRequest]);
  // Dynamic custom-element tags require createElement; the ref is only read by the effect above.
  // eslint-disable-next-line react-hooks/refs
  return createElement(tag, { ref: host }, children);
}
export function PipNodeRenderer({ workspaceId, rootNodeIds, workspaceView, graph, node, selection, purpose = "node", projectionContext, execution, elements, nodeTypes, onRequest }: {
    workspaceId: string;
    rootNodeIds: string[];
    workspaceView: import("../../pip/index.ts").JsonValue;
    graph: Pip;
    node: Pip;
    selection: string[];
    purpose?: "node" | "workspace";
    projectionContext?: ProjectionContextInput;
    elements: ElementPluginRegistry;
    nodeTypes: NodeTypePluginRegistry;
    execution?: ExecutionContextSnapshot;
    onRequest: (request: PipElementRequest) => void;
}) {
    const { type, projection, projectionData, declaration, error, observed, context: contextKind } = resolveNodePresentation(
    node, graph, elements, nodeTypes, purpose, { workspaceId, rootNodeIds, workspaceView, selection, projectionContext },
  );
    const context = useMemo<ElementContext>(() => ({
    workspaceId, rootNodeIds, workspaceView, graph, node, projectionNode: node, observedNode: observed, projectionContext: contextKind, typeDescriptor: type, selection,
    projection: projection ? { id: projection.id, data: projectionData ?? null } : undefined, execution,
  }), [workspaceId, rootNodeIds, workspaceView, graph, node, observed, contextKind, type, selection, projection, projectionData, execution]);
    if (error)
        return <div className={styles.orphan}><div className={styles.nodeHeading}><strong>{node.id}</strong><span>projection error</span></div><p>{error}</p><RawPips pips={node.pips}/></div>;
    if (declaration)
        return <PluginProjection tag={declaration.tag} context={context} onRequest={onRequest}>
    {contextKind?.scope === "children" && contextKind.surface === "workspace" && <EmbeddedItems projectionNode={node} workspaceId={workspaceId} rootNodeIds={rootNodeIds} workspaceView={workspaceView} graph={graph} selection={selection} execution={execution} elements={elements} nodeTypes={nodeTypes} onRequest={onRequest}/>}
  </PluginProjection>;
    return <div className={styles.orphan}>
    <div className={styles.nodeHeading}><strong>{node.id}</strong><span>{type?.name ?? "orphan Pip"}</span></div>
    <RawPips pips={node.pips}/>
  </div>;
}
function EmbeddedItems({ projectionNode, workspaceId, rootNodeIds, workspaceView, graph, selection, execution, elements, nodeTypes, onRequest }: {
    projectionNode: Pip;
    workspaceId: string;
    rootNodeIds: string[];
    workspaceView: import("../../pip/index.ts").JsonValue;
    graph: Pip;
    selection: string[];
    execution?: ExecutionContextSnapshot;
    elements: ElementPluginRegistry;
    nodeTypes: NodeTypePluginRegistry;
    onRequest: (request: PipElementRequest) => void;
}) {
    // 组合关系以 Pip 为权威，A3 只能装饰布局，不能伪造可放大的子节点。
    const items = presentedProjections(projectionNode, graph);
    return <>{items.map(({ projectionNodeId, frame }) => {
            const node = graphNodes(graph)[projectionNodeId];
            const definition = node && projectionForInstance(node, nodeTypes.projections());
            if (!node || !definition || observationScope(definition) !== "self" || !definition.surfaces?.includes("embedded")) {
                return <div className={styles.orphan} key={projectionNodeId}>Invalid embedded Projection Instance: {projectionNodeId}</div>;
            }
            return <article key={projectionNodeId} data-embedded-projection={projectionNodeId} style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}>
      <PipNodeRenderer workspaceId={workspaceId} rootNodeIds={rootNodeIds} workspaceView={workspaceView} graph={graph} node={node} selection={selection} purpose="workspace" projectionContext={{ scope: "self", surface: "embedded", kind: "self-embedded", parentProjectionNodeId: projectionNode.id, frame }} execution={execution} elements={elements} nodeTypes={nodeTypes} onRequest={onRequest}/>
    </article>;
        })}</>;
}
