"use client";

/** Selects workspace roots and lays out one renderer per projection instance. */
import type { RelationElementRequest } from "../contracts/package-types.ts";
import type { ElementPluginRegistry } from "../activation/element-registry.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type { WorkspaceSession } from "../workspace/workspace-store.ts";
import { RelationNodeRenderer } from "../projection/projection-renderer.tsx";
import styles from "../view/relation-host.module.css";

export function NodeCanvas({ workspace, elements, nodeTypes, onSelectionChange, onRequest }: {
  workspace: WorkspaceSession; elements: ElementPluginRegistry; nodeTypes: NodeTypePluginRegistry;
  onSelectionChange: (selection: string[]) => void;
  onRequest: (request: RelationElementRequest) => void;
}) {
  const nodes = Object.values(workspace.graph.nodes);
  const roots = workspace.rootNodeIds.map((id) => workspace.graph.nodes[id]).filter(Boolean);
  const hasWorkspaceProjection = roots.some((node) => nodeTypes.projections().some((projection) => {
    if (projection.purpose !== "workspace") return false;
    try { return projection.matches(node, workspace.graph); } catch { return true; }
  }));
  return <section className={styles.canvasWrap} data-testid="relation-workspace">
    <div className={styles.canvasInfo}>RelationGraph · revision {workspace.graph.revision} · {nodes.length} 个节点 · {workspace.selection.length} 个已选</div>
    <div className={`${styles.canvas} ${hasWorkspaceProjection ? styles.workspaceProjectionGrid : styles.relationGrid}`}>
      {hasWorkspaceProjection ? roots.map((node) => <article key={node.id} data-node-id={node.id} className={styles.workspaceProjection}>
        <RelationNodeRenderer workspaceId={workspace.id} rootNodeIds={workspace.rootNodeIds} workspaceView={workspace.views}
          graph={workspace.graph} node={node} selection={workspace.selection} purpose="workspace"
          elements={elements} nodeTypes={nodeTypes} onRequest={onRequest} />
      </article>) : nodes.map((node) => <article key={node.id} data-node-id={node.id}
        className={`${styles.node} ${workspace.selection.includes(node.id) ? styles.selected : ""}`}
        onClick={(event) => onSelectionChange(event.metaKey || event.ctrlKey
          ? workspace.selection.includes(node.id) ? workspace.selection.filter((id) => id !== node.id) : [...workspace.selection, node.id]
          : [node.id])}>
        <RelationNodeRenderer workspaceId={workspace.id} rootNodeIds={workspace.rootNodeIds} workspaceView={workspace.views}
          graph={workspace.graph} node={node} selection={workspace.selection}
          elements={elements} nodeTypes={nodeTypes} onRequest={onRequest} />
      </article>)}
      {!nodes.length && <div className={styles.empty}>这个独立工作区没有 RelationNode。</div>}
    </div>
  </section>;
}
