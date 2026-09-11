import { graphNodes } from "../../pip/pip-model.ts";
import type { Pip } from "../../pip/index.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type { ExecutionContextSnapshot, ProjectionExecutionViewState, ProjectionNavigationState } from "../contracts/package-types.ts";
import { currentRoute, moveProjectionHistory, navigateProjection, replaceCurrentProjection } from "../projection/projection-navigation.ts";
import { forwardRoute, projectionOptions, routeForProjection } from "../projection/projection-routes.ts";
import styles from "./pip-host.module.css";

const labelFor = (nodeId: string, graph: Pip, nodeTypes: NodeTypePluginRegistry) => {
  const node = graphNodes(graph)[nodeId]; if (!node) return nodeId;
  for (const type of nodeTypes.types()) try { if (type.matches?.(node, graph)) return type.label?.(node, graph) || type.name; } catch { continue; }
  const name = node.pips.find(({ id, predicate_value }) => id === "name" || predicate_value?.predicate.node_id.endsWith(".name"));
    const value = name?.predicate_value?.value;
    return value?.kind === "const" ? String(value.value) : nodeId;
};

export function ProjectionNavbar({ navigation, execution, executionView, graph, nodeTypes, onChange }: {
  navigation: ProjectionNavigationState; graph: Pip; nodeTypes: NodeTypePluginRegistry;
  execution?: ExecutionContextSnapshot; executionView: ProjectionExecutionViewState;
  onChange: (navigation: ProjectionNavigationState) => void;
}) {
  const route = currentRoute(navigation), options = projectionOptions(route.observedNodeId, graph, nodeTypes);
  const session = execution?.sessions.find((item) => item.id === executionView.sessionId) ?? execution?.sessions.at(-1);
  const crumbs = navigation.entries.slice(0, navigation.index + 1).filter((entry, index, all) => !index || entry.observedNodeId !== all[index - 1].observedNodeId);
  const changeProjection = (projectionNodeId: string) => {
    const next = routeForProjection(projectionNodeId, graph, nodeTypes, route.enteredFrom);
    if (!next) return;
    if (next.scope === route.scope) { onChange(replaceCurrentProjection(navigation, next)); return; }
    if (route.scope === "self") {
      const forward = forwardRoute(navigation, graph, nodeTypes);
      if (forward?.projectionNodeId === next.projectionNodeId) onChange(navigateProjection(navigation, forward));
      return;
    }
    const previous = navigation.entries[navigation.index - 1];
    if (previous?.scope === "self" && previous.observedNodeId === next.observedNodeId) {
      onChange(replaceCurrentProjection({ ...navigation, index: navigation.index - 1 }, next));
    }
  };
  return <nav className={styles.projectionNav}>
    <button disabled={!navigation.index} onClick={() => onChange(moveProjectionHistory(navigation, -1))} title="后退">‹</button>
    <button disabled={navigation.index >= navigation.entries.length - 1} onClick={() => onChange(moveProjectionHistory(navigation, 1))} title="前进">›</button>
    <div className={styles.projectionCrumbs}>{crumbs.map((entry) => <button key={`${entry.projectionNodeId}:${entry.scope}`} onClick={() => {
                const index = navigation.entries.lastIndexOf(entry);
                onChange({ ...navigation, index, semanticScale: 1 });
            }}>{labelFor(entry.observedNodeId, graph, nodeTypes)}</button>)}</div>
    <select value={route.projectionNodeId} onChange={(event) => changeProjection(event.target.value)} aria-label="当前投影">
      <optgroup label="观察自身">{options.filter(({ scope }) => scope === "self").map((item) => <option key={item.projectionNodeId} value={item.projectionNodeId}>{item.label}</option>)}</optgroup>
      <optgroup label="观察子级">{options.filter(({ scope }) => scope === "children").map((item) => <option key={item.projectionNodeId} value={item.projectionNodeId}>{item.label}</option>)}</optgroup>
    </select>
    {session && <span title={session.id}>{session.status}</span>}
  </nav>;
}
