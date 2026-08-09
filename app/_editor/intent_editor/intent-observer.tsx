"use client";

import { useMemo, useState } from "react";
import { EventCanvas } from "./event-canvas";
import { formatHour, type ManualPositions } from "./geometry";
import {
  kindNames,
  relationNames,
  todayScene,
  type NodeId,
  type ViewMode,
} from "./model";
import styles from "./intent-observer.module.css";

export function IntentObserver() {
  const [mode, setMode] = useState<ViewMode>("tube");
  const [zRotation, setZRotation] = useState(135);
  const [yAxisLength, setYAxisLength] = useState(200);
  const [zAxisLength, setZAxisLength] = useState(200);
  const [xZoom, setXZoom] = useState(1);
  const [xPan, setXPan] = useState(0);
  const [manualPositions, setManualPositions] = useState<ManualPositions>({});
  const [selectedId, setSelectedId] = useState<NodeId>("deliver-breakfast");
  const selected = todayScene.nodes[selectedId];
  const selectedIsEvent = selected.tag.kind === "event";

  const counts = useMemo(() => {
    const nodes = Object.values(todayScene.nodes);
    return {
      entities: nodes.filter((node) => node.tag.kind !== "event").length,
      events: nodes.filter((node) => node.tag.kind === "event").length,
      relations: nodes.reduce((total, node) => total + node.relations.length, 0),
    };
  }, []);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>INTENT / EVENT OBSERVER</p>
          <h1>小明的今天</h1>
        </div>
        <div className={styles.modeSwitch} aria-label="观察模式">
          <button className={mode === "quadrant" ? styles.activeMode : ""} onClick={() => setMode("quadrant")}>
            单象限
          </button>
          <button className={mode === "tube" ? styles.activeMode : ""} onClick={() => setMode("tube")}>
            管道
          </button>
        </div>
      </header>

      <section className={styles.story}>
        <span>今天</span>
        <p>小明 <strong>08:00</strong> 从家出发，08:30 跑到小红家送早餐；随后用 <strong>100 USDT</strong> 购买 BTC，再用剩余 <strong>10 USDT</strong> 买了一只烤鸡。</p>
      </section>

      <div className={styles.workspace}>
        <section className={styles.stage}>
          <div className={styles.stageHeader}>
            <div>
              <span className={styles.liveDot} />
              今日场景
            </div>
            {mode === "quadrant" && (
              <div className={styles.stageControls}>
                <label className={styles.rotationControl}>
                  <span>z 绕 y</span>
                  <input type="range" min="0" max="180" step="1" value={zRotation} aria-label="z轴绕y轴旋转角度" onInput={(event) => setZRotation(Number(event.currentTarget.value))} />
                  <output>{zRotation}°</output>
                </label>
                <label className={styles.rotationControl}>
                  <span>y 轴长</span>
                  <input type="range" min="120" max="280" step="10" value={yAxisLength} aria-label="y轴总长度" onInput={(event) => setYAxisLength(Number(event.currentTarget.value))} />
                  <output>{yAxisLength}px</output>
                </label>
                <label className={styles.rotationControl}>
                  <span>z 轴长</span>
                  <input type="range" min="120" max="280" step="10" value={zAxisLength} aria-label="z轴总长度" onInput={(event) => setZAxisLength(Number(event.currentTarget.value))} />
                  <output>{zAxisLength}px</output>
                </label>
              </div>
            )}
            <p>{counts.entities} 个节点 · {counts.events} 个事件 · {counts.relations} 条关系</p>
            <div className={styles.xAxisControls}>
              <label className={styles.rotationControl}>
                <span>x 缩放</span>
                <input type="range" min="0.5" max="3" step="0.1" value={xZoom} aria-label="x轴缩放" onInput={(event) => setXZoom(Number(event.currentTarget.value))} />
                <output>{xZoom.toFixed(1)}×</output>
              </label>
              <label className={styles.rotationControl}>
                <span>x 平移</span>
                <input type="range" min="-250" max="250" step="10" value={xPan} aria-label="x轴平移" onInput={(event) => setXPan(Number(event.currentTarget.value))} />
                <output>{xPan}px</output>
              </label>
            </div>
          </div>
          <EventCanvas
            state={todayScene}
            mode={mode}
            selectedId={selectedId}
            zRotation={zRotation}
            yAxisLength={yAxisLength}
            zAxisLength={zAxisLength}
            xZoom={xZoom}
            xPan={xPan}
            manualPositions={manualPositions}
            onMoveNode={(id, position) => setManualPositions((current) => ({ ...current, [id]: position }))}
            onSelect={setSelectedId}
          />
          <div className={styles.legend}>
            <span><i className={styles.entityLegend} />非事件节点</span>
            <span><i className={styles.eventLegend} />事件</span>
            <span><i className={styles.relationLegend} />关系</span>
          </div>
        </section>

        <aside className={styles.inspector}>
          <p className={styles.eyebrow}>{selectedIsEvent ? "SELECTED EVENT" : "SELECTED NODE"}</p>
          <h2>{selected.tag.name}</h2>
          <p className={styles.eventId}>{selected.tag.id}</p>

          <div className={styles.detailBlock}>
            <label>{selectedIsEvent ? "时间" : "类型"}</label>
            <strong>{selected.tag.kind === "event"
              ? `${formatHour(selected.tag.time!.start)} — ${formatHour(selected.tag.time?.end ?? selected.tag.time!.start)}`
              : kindNames[selected.tag.kind]}</strong>
            <small>{selectedIsEvent
              ? "事件位置由以下节点的几何中心实时计算"
              : manualPositions[selectedId]
                ? "手动 yz 坐标，不再参与自动位置计算"
                : "自动位置；在 z 绕 y = 0° 时可拖动"}</small>
          </div>

          <div className={styles.relationList}>
            {selected.relations.map((relation) => {
              const node = todayScene.nodes[relation.targetId];
              const kind = node.tag.kind === "event" ? "event" : kindNames[node.tag.kind];
              return (
                <div key={`${relation.type}-${relation.targetId}`}>
                  <span>{relationNames[relation.type]}</span>
                  <strong>{node.tag.name}</strong>
                  <small>{kind}</small>
                </div>
              );
            })}
          </div>

          <div className={styles.ruleCard}>
            <span>位置规则</span>
            <code>event.yz = average(relations[].node.yz)</code>
          </div>
        </aside>
      </div>
    </main>
  );
}
