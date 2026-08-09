import {
  eventCenter,
  entitySurfacePoint,
  formatHour,
  pointsAttribute,
  project,
  surfaceOutline,
  surfacePoint,
  timeX,
} from "./geometry";
import { kindColors, type NodeId, type SceneNode, type SceneState, type ViewMode } from "./model";
import { SurfaceAxes } from "./surface-axes";
import styles from "./intent-observer.module.css";

type EventCanvasProps = {
  state: SceneState;
  mode: ViewMode;
  selectedId: NodeId;
  zRotation: number;
  yAxisLength: number;
  zAxisLength: number;
  xZoom: number;
  xPan: number;
  onSelect: (id: NodeId) => void;
};

const defaultEventColor = "#7c9cff";

function relatedNodes(event: SceneNode, state: SceneState): SceneNode[] {
  return event.relations.flatMap((relation) => {
    const node = state.nodes[relation.targetId];
    return node ? [node] : [];
  });
}

export function EventCanvas({
  state,
  mode,
  selectedId,
  zRotation,
  yAxisLength,
  zAxisLength,
  xZoom,
  xPan,
  onSelect,
}: EventCanvasProps) {
  const nodes = Object.values(state.nodes);
  const entities = nodes.filter((node) => node.tag.kind !== "event");
  const events = nodes.filter((node) => node.tag.kind === "event");
  const selected = state.nodes[selectedId];
  const selectedTargets = new Set(selected?.relations.map((relation) => relation.targetId));
  const angle = mode === "quadrant" ? zRotation : 90;
  const surfaceCenter = project({ x: 0, y: 0, z: 0 }, mode, "surface", angle, yAxisLength, zAxisLength);
  const surfaceRight = project({ x: 0, y: 0, z: 1 }, mode, "surface", angle, yAxisLength, zAxisLength);
  const timelineBoundary = Math.max(mode === "quadrant" ? 260 : 270, surfaceRight.x + 36);

  return (
    <svg
      className={styles.canvas}
      viewBox="0 0 960 540"
      role="img"
      aria-label="小明今日购买事件的时空观察图"
    >
      <defs>
        <linearGradient id="time-axis" x1="0" x2="1">
          <stop stopColor="#7085ff" />
          <stop offset="1" stopColor="#4de1c1" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker id="axis-arrow-y" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M 0 0 L 7 3.5 L 0 7 Z" fill="#7c9cff" />
        </marker>
        <marker id="axis-arrow-z" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M 0 0 L 7 3.5 L 0 7 Z" fill="#4de1c1" />
        </marker>
        <clipPath id="timeline-viewport">
          <rect x={timelineBoundary} y="0" width={960 - timelineBoundary} height="540" />
        </clipPath>
      </defs>

      <g className={styles.structure} clipPath="url(#timeline-viewport)">
        {[0, 0.25, 0.5, 0.75, 1].map((x) => (
          <polyline
            key={x}
            points={pointsAttribute(surfaceOutline(mode, x, "timeline", angle, yAxisLength, zAxisLength, xZoom, xPan))}
            className={styles.surfaceGuide}
          />
        ))}
        {[0, 0.25, 0.5, 0.75].map((sector) => {
          const position = { sector, depth: mode === "tube" ? 1 : sector === 0 ? 0 : 1 };
          const yz = surfacePoint(position, mode);
          const from = project({ x: 0, ...yz }, mode, "timeline", angle, yAxisLength, zAxisLength, xZoom, xPan);
          const to = project({ x: 1, ...yz }, mode, "timeline", angle, yAxisLength, zAxisLength, xZoom, xPan);
          return <line key={sector} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
        })}
      </g>

      {mode === "quadrant" && <SurfaceAxes entities={entities} state={state} angle={angle} yAxisLength={yAxisLength} zAxisLength={zAxisLength} />}

      <g className={styles.timeLabels} clipPath="url(#timeline-viewport)">
        {[8, 11, 14, 17, 20].map((hour) => {
          const point = project({ x: timeX(hour), y: 0, z: 0 }, mode, "timeline", angle, yAxisLength, zAxisLength, xZoom, xPan);
          return (
            <text key={hour} x={point.x} y={mode === "tube" ? 505 : 487}>
              {String(hour).padStart(2, "0")}:00
            </text>
          );
        })}
      </g>

      <text x="46" y="44" className={styles.axisLabel}>空间截面 · yz</text>
      <text x="238" y="44" className={styles.gapLabel}>关系映射</text>
      <text x="790" y="44" className={styles.axisLabel}>时间 · x →</text>

      <g className={styles.relations}>
        {entities.flatMap((node) => {
          if (!node.tag.position) return [];
          const sourceYZ = entitySurfacePoint(node, state, mode);
          const source = project({ x: 0, ...sourceYZ }, mode, "surface", angle, yAxisLength, zAxisLength);
          return node.relations.flatMap((relation) => {
            const targetNode = state.nodes[relation.targetId];
            const directlySelected = selectedId === node.tag.id || selectedId === relation.targetId;
            const cascadeSelected = selected?.tag.kind === "event"
              && selectedTargets.has(node.tag.id)
              && selectedTargets.has(relation.targetId);
            if (!targetNode?.tag.position || (!directlySelected && !cascadeSelected)) return [];
            const targetYZ = entitySurfacePoint(targetNode, state, mode);
            const target = project({ x: 0, ...targetYZ }, mode, "surface", angle, yAxisLength, zAxisLength);
            return [
              <line
                key={`${node.tag.id}-${relation.type}-${relation.targetId}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                className={styles.entityRelation}
                data-entity-relation={`${node.tag.id}-${relation.targetId}`}
              />,
            ];
          });
        })}
        {events.flatMap((event) => {
          const center = eventCenter(event, state, mode);
          const time = event.tag.time;
          if (!center || !time) return [];
          const eventPoint = project({ x: timeX(time.start), ...center }, mode, "timeline", angle, yAxisLength, zAxisLength, xZoom, xPan);
          const eventEndPoint = project({ x: timeX(time.end ?? time.start), ...center }, mode, "timeline", angle, yAxisLength, zAxisLength, xZoom, xPan);
          const eventVisible = Math.max(eventPoint.x, eventEndPoint.x) >= timelineBoundary
            && Math.min(eventPoint.x, eventEndPoint.x) <= 960;
          if (!eventVisible) return [];
          return relatedNodes(event, state).flatMap((node) => {
            if (!node.tag.position) return [];
            const yz = entitySurfacePoint(node, state, mode);
            const target = project({ x: 0, ...yz }, mode, "surface", angle, yAxisLength, zAxisLength);
            const active = event.tag.id === selectedId || node.tag.id === selectedId;
            return [
              <line
                key={`${event.tag.id}-${node.tag.id}`}
                x1={eventPoint.x}
                y1={eventPoint.y}
                x2={target.x}
                y2={target.y}
                className={active ? styles.relationActive : undefined}
                data-event-relation={`${event.tag.id}-${node.tag.id}`}
              />,
            ];
          });
        })}
      </g>

      <g>
        {entities.map((node) => {
          if (!node.tag.position) return null;
          const yz = entitySurfacePoint(node, state, mode);
          const point = project({ x: 0, ...yz }, mode, "surface", angle, yAxisLength, zAxisLength);
          const directlySelected = selectedId === node.tag.id;
          const eventRelated = selected?.tag.kind === "event"
            && selected.relations.some((relation) => relation.targetId === node.tag.id);
          const labelDirectionX = point.x >= surfaceCenter.x ? 1 : -1;
          return (
            <g
              key={node.tag.id}
              className={styles.entity}
              onClick={() => onSelect(node.tag.id)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter" || keyEvent.key === " ") onSelect(node.tag.id);
              }}
              role="button"
              tabIndex={0}
              aria-label={`选择节点 ${node.tag.name}`}
            >
              <circle
                cx={point.x}
                cy={point.y}
                r={directlySelected || eventRelated ? 7 : 5}
                className={directlySelected ? styles.entitySelected : eventRelated ? styles.entityRelated : undefined}
              />
              <text
                x={point.x + labelDirectionX * 11}
                y={point.y + 4}
                textAnchor={labelDirectionX > 0 ? "start" : "end"}
              >
                {node.tag.name}
              </text>
            </g>
          );
        })}
      </g>

      <g clipPath="url(#timeline-viewport)">
        {events.map((event) => {
          const center = eventCenter(event, state, mode);
          const time = event.tag.time;
          if (!center || !time) return null;
          const start = project({ x: timeX(time.start), ...center }, mode, "timeline", angle, yAxisLength, zAxisLength, xZoom, xPan);
          const end = project({ x: timeX(time.end ?? time.start), ...center }, mode, "timeline", angle, yAxisLength, zAxisLength, xZoom, xPan);
          const active = event.tag.id === selectedId;
          const hasVirtualRelation = event.relations.some((relation) => state.nodes[relation.targetId]?.tag.kind === "virtual");
          const color = hasVirtualRelation ? kindColors.virtual : defaultEventColor;
          const startRadius = 5 + Math.min(5, event.relations.length);
          const endRadius = Math.max(3, startRadius - 3);
          return (
            <g
              key={event.tag.id}
              className={`${styles.event} ${active ? styles.eventActive : ""}`}
              onClick={() => onSelect(event.tag.id)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter" || keyEvent.key === " ") onSelect(event.tag.id);
              }}
              role="button"
              tabIndex={0}
              data-event-id={event.tag.id}
            >
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={styles.eventTrack} />
              <circle cx={start.x} cy={start.y} r={startRadius} style={{ fill: color }} data-event-point="start" />
              <circle cx={end.x} cy={end.y} r={endRadius} style={{ fill: color }} data-event-point="end" />
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={styles.eventConnector} style={{ stroke: color }} />
              <text x={(start.x + end.x) / 2} y={start.y - 17} textAnchor="middle">
                {event.tag.name}
              </text>
              <text x={(start.x + end.x) / 2} y={start.y + 24} textAnchor="middle">
                {formatHour(time.start)} → {formatHour(time.end ?? time.start)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
