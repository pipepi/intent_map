import type { RelationGraph } from "../../relation/index.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type { ExecutionContextSnapshot, ProjectionExecutionViewState, ProjectionNavigationState } from "../contracts/package-types.ts";
import { currentRoute, moveProjectionHistory, replaceCurrentProjection } from "../projection/projection-navigation.ts";
import { projectionOptions, routeForProjection } from "../projection/projection-routes.ts";
import styles from "./relation-host.module.css";

const labelFor = (nodeId: string, graph: RelationGraph, nodeTypes: NodeTypePluginRegistry) => {
  const node = graph.nodes[nodeId]; if (!node) return nodeId;
  for (const type of nodeTypes.types()) try { if (type.matches?.(node, graph)) return type.label?.(node, graph) || type.name; } catch { continue; }
  const name = node.relations.find(({ id, predicate }) => id === "name" || predicate.nodeId.endsWith(".name"));
  return name?.object.kind === "const" ? String(name.object.value) : nodeId;
};

export function ProjectionNavbar({ navigation, resizeMode, execution, executionView, graph, nodeTypes, onChange, onReset, onClose }: {
  navigation: ProjectionNavigationState; graph: RelationGraph; nodeTypes: NodeTypePluginRegistry;
  execution?: ExecutionContextSnapshot; executionView: ProjectionExecutionViewState;
  resizeMode: "simple" | "full"; onChange: (navigation: ProjectionNavigationState) => void; onReset: () => void; onClose: () => void;
}) {
  const route = currentRoute(navigation), options = projectionOptions(route.observedNodeId, graph, nodeTypes);
  const session = execution?.sessions.find((item) => item.id === executionView.sessionId) ?? execution?.sessions.at(-1);
  const crumbs = navigation.entries.slice(0, navigation.index + 1).filter((entry, index, all) => !index || entry.observedNodeId !== all[index - 1].observedNodeId);
  const changeProjection = (projectionNodeId: string) => {
    const next = routeForProjection(projectionNodeId, graph, nodeTypes, route.enteredFrom);
    if (next) onChange(replaceCurrentProjection(navigation, next));
  };
  return <nav className={styles.projectionNav} data-window-drag>
    <button disabled={!navigation.index} onClick={() => onChange(moveProjectionHistory(navigation, -1))} title="后退">‹</button>
    <button disabled={navigation.index >= navigation.entries.length - 1} onClick={() => onChange(moveProjectionHistory(navigation, 1))} title="前进">›</button>
    <div className={styles.projectionCrumbs}>{crumbs.map((entry) => <button key={`${entry.projectionNodeId}:${entry.context}`} onClick={() => {
      const index = navigation.entries.lastIndexOf(entry); onChange({ ...navigation, index, semanticScale: 1 });
    }}>{labelFor(entry.observedNodeId, graph, nodeTypes)}</button>)}</div>
    <select value={route.projectionNodeId} onChange={(event) => changeProjection(event.target.value)} aria-label="当前投影">
      <optgroup label="观察自身">{options.filter(({ context }) => context === "self-workspace").map((item) => <option key={item.projectionNodeId} value={item.projectionNodeId}>{item.label}</option>)}</optgroup>
      <optgroup label="观察子级">{options.filter(({ context }) => context === "children-workspace").map((item) => <option key={item.projectionNodeId} value={item.projectionNodeId}>{item.label}</option>)}</optgroup>
    </select>
    <button onClick={onReset} title="重置投影缩放与位置">{Math.round(navigation.semanticScale * 100)}%</button>
    {session && <span title={session.id}>{session.status}</span>}
    <div className={styles.projectionWindowActions}>
      <button data-resize-toggle title={resizeMode === "full" ? "切换为三向缩放" : "切换为八向缩放"}>{resizeMode === "full" ? "⤢" : "┘"}</button>
      <button onClick={onClose} title="关闭投影窗口">×</button>
    </div>
  </nav>;
}
