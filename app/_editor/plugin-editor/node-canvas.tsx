"use client";

import type { RelationElementRequest } from "./package-types";
import type { ElementPluginRegistry } from "./element-runtime";
import type { NodeTypePluginRegistry } from "./node-type-runtime";
import type { WorkspaceSession } from "./types";
import { RelationNodeRenderer } from "./node-renderer";
import styles from "./editor.module.css";

export function NodeCanvas({ workspace, elements, nodeTypes, onSelectionChange, onRequest }: {
  workspace: WorkspaceSession; elements: ElementPluginRegistry; nodeTypes: NodeTypePluginRegistry;
  onSelectionChange: (selection: string[]) => void;
  onRequest: (request: RelationElementRequest) => void;
}) {
  const nodes = Object.values(workspace.graph.nodes);
  return <section className={styles.canvasWrap} data-testid="relation-workspace">
    <div className={styles.canvasInfo}>RelationGraph · revision {workspace.graph.revision} · {nodes.length} 个节点 · {workspace.selection.length} 个已选</div>
    <div className={`${styles.canvas} ${styles.relationGrid}`}>
      {nodes.map((node) => <article key={node.id} data-node-id={node.id}
        className={`${styles.node} ${workspace.selection.includes(node.id) ? styles.selected : ""}`}
        onClick={(event) => onSelectionChange(event.metaKey || event.ctrlKey
          ? workspace.selection.includes(node.id) ? workspace.selection.filter((id) => id !== node.id) : [...workspace.selection, node.id]
          : [node.id])}>
        <RelationNodeRenderer workspaceId={workspace.id} graph={workspace.graph} node={node} selection={workspace.selection}
          elements={elements} nodeTypes={nodeTypes} onRequest={onRequest} />
      </article>)}
      {!nodes.length && <div className={styles.empty}>这个独立工作区没有 RelationNode。</div>}
    </div>
  </section>;
}
