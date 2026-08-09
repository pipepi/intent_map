import { entityKindOrder, eventReferenceCount, project } from "./geometry";
import { kindColors, kindNames, type SceneNode, type SceneState } from "./model";
import styles from "./intent-observer.module.css";

type SurfaceAxesProps = {
  entities: SceneNode[];
  state: SceneState;
  angle: number;
  yAxisLength: number;
  zAxisLength: number;
};

export function SurfaceAxes({ entities, state, angle, yAxisLength, zAxisLength }: SurfaceAxesProps) {
  const total = entities.length;
  const counts = entityKindOrder.map((kind) => entities.filter((node) => node.tag.kind === kind).length);
  const segments = entityKindOrder.map((kind, index) => {
    const count = counts[index];
    const offset = counts.slice(0, index).reduce((sum, value) => sum + value, 0);
    return { kind, count, start: offset / total, end: (offset + count) / total };
  });
  const maxReferences = Math.max(1, ...entities.map((node) => eventReferenceCount(node, state)));
  const referenceTicks = [...new Set(entities.map((node) => eventReferenceCount(node, state)))].sort((a, b) => b - a);
  const origin = project({ x: 0, y: 0, z: 0 }, "quadrant", "surface", angle, yAxisLength, zAxisLength);
  const zEnd = project({ x: 0, y: 0, z: 1 }, "quadrant", "surface", angle, yAxisLength, zAxisLength);
  const guides = segments.map(({ kind, end }) => ({
    kind,
    from: project({ x: 0, y: end, z: 0 }, "quadrant", "surface", angle, yAxisLength, zAxisLength),
    to: project({ x: 0, y: end, z: 1 }, "quadrant", "surface", angle, yAxisLength, zAxisLength),
  }));

  return (
    <g className={styles.surfaceAxes}>
      <defs>
        <linearGradient id="z-axis-gradient" gradientUnits="userSpaceOnUse" x1={origin.x} y1={origin.y} x2={zEnd.x} y2={zEnd.y}>
          <stop stopColor="#4de1c1" stopOpacity="0.8" />
          <stop offset="1" stopColor="#4de1c1" stopOpacity="0.04" />
        </linearGradient>
        {guides.map(({ kind, from, to }) => (
          <linearGradient key={kind} id={`type-guide-${kind}`} gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={to.x} y2={to.y}>
            <stop stopColor={kindColors[kind]} stopOpacity="0.8" />
            <stop offset="1" stopColor={kindColors[kind]} stopOpacity="0.04" />
          </linearGradient>
        ))}
      </defs>
      {guides.map(({ kind, from, to }) => (
        <line key={kind} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={styles.typeGuide} stroke={`url(#type-guide-${kind})`} />
      ))}
      <circle cx={origin.x} cy={origin.y} r="3" />
      {segments.map(({ kind, count, start, end }, index) => {
        const from = project({ x: 0, y: start, z: 0 }, "quadrant", "surface", angle, yAxisLength, zAxisLength);
        const to = project({ x: 0, y: end, z: 0 }, "quadrant", "surface", angle, yAxisLength, zAxisLength);
        return (
          <g key={kind}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} style={{ stroke: kindColors[kind] }} />
            <text x={from.x - 9} y={(from.y + to.y) / 2 + 3} textAnchor="end" style={{ fill: kindColors[kind] }}>
              {kindNames[kind]} {count}/{total}
            </text>
            {index === segments.length - 1 && <line x1={to.x} y1={to.y} x2={to.x} y2={to.y - 8} style={{ stroke: kindColors[kind] }} markerEnd="url(#axis-arrow-y)" />}
          </g>
        );
      })}
      <text x={origin.x - 9} y={origin.y - yAxisLength - 13} textAnchor="end" className={styles.yAxisText}>y · 节点类型</text>
      <line x1={origin.x} y1={origin.y} x2={zEnd.x} y2={zEnd.y} className={styles.zAxis} style={{ stroke: "url(#z-axis-gradient)" }} markerEnd="url(#axis-arrow-z)" />
      {referenceTicks.map((references) => {
        const z = 1 - references / maxReferences;
        const tick = project({ x: 0, y: 0, z }, "quadrant", "surface", angle, yAxisLength, zAxisLength);
        return <text key={references} x={tick.x + 9} y={tick.y + 14} className={styles.zTickText}>{references}</text>;
      })}
      <text x={zEnd.x + 4} y={zEnd.y + 18} className={styles.zAxisText}>z · 热度</text>
    </g>
  );
}
