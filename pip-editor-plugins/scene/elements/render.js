import { styles } from "./styles.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const control = (key, label, value, min, max, step, suffix = "") => `<label class="control"><span>${label}</span><input data-camera="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output>${value}${suffix}</output></label>`;
const controls = (data) => {
  const camera = data.camera;
  const spatial = data.mode === "quadrant" ? [
    control("zRotation", "z 绕 y", camera.zRotation, 90, 180, 1, "°"),
    control("yAxisLength", "y 轴长", camera.yAxisLength, 120, 280, 10),
    control("zAxisLength", "z 轴长", camera.zAxisLength, 120, 280, 10),
  ].join("") : "";
  return `${spatial}${control("xZoom", "x 缩放", camera.xZoom, .5, 3, .1, "×")}${control("xPan", "x 平移", camera.xPan, -250, 250, 10)}<div class="counts">${data.counts.entities} 个实体 · ${data.counts.events} 个事件 · ${data.counts.relations} 条关系</div>`;
};
const axes = (data) => {
  if (!data.axes) return "";
  const { origin, zEnd, segments, referenceTicks, total } = data.axes;
  return `<g>${segments.map((segment) => {
    const fromY = origin.y - segment.start * data.camera.yAxisLength, toY = origin.y - segment.end * data.camera.yAxisLength;
    return `<line class="axis" x1="${origin.x}" y1="${fromY}" x2="${origin.x}" y2="${toY}" stroke="${segment.color}"/><text class="axisText" x="${origin.x - 8}" y="${(fromY + toY) / 2}" text-anchor="end">${segment.name} ${segment.count}/${total}</text>`;
  }).join("")}<line class="axis" x1="${origin.x}" y1="${origin.y}" x2="${zEnd.x}" y2="${zEnd.y}" stroke="#4de1c1"/><text class="axisText" x="${zEnd.x + 5}" y="${zEnd.y + 16}">z · 热度</text>${referenceTicks.map((tick) => `<text class="axisText" x="${tick.point.x + 7}" y="${tick.point.y + 12}">${tick.references}</text>`).join("")}</g>`;
};
const svg = (data) => `<svg class="canvas" viewBox="0 0 960 540" role="img" aria-label="${data.mode === "quadrant" ? "象限" : "管道"}时空观察图">
  <defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g class="structure">${[0, .25, .5, .75].map((value) => `<line x1="280" y1="${100 + value * 390}" x2="940" y2="${100 + value * 390}"/>`).join("")}</g>
  ${axes(data)}<g>${data.timeline.map((tick) => `<text class="timeText" x="${tick.point.x}" y="510">${tick.label}</text>`).join("")}</g>
  <g>${data.entityLines.map((line) => `<line class="entityRelation" x1="${line.from.x}" y1="${line.from.y}" x2="${line.to.x}" y2="${line.to.y}"/>`).join("")}${data.relationLines.map((line) => `<line class="eventRelation ${line.active ? "active" : ""}" x1="${line.from.x}" y1="${line.from.y}" x2="${line.to.x}" y2="${line.to.y}"/>`).join("")}</g>
  <g>${data.entities.map((entity) => `<g data-select="${esc(entity.id)}" ${data.editable ? `data-drag="${esc(entity.id)}"` : ""} class="entity ${entity.selected ? "selected" : ""} ${entity.related ? "related" : ""} ${data.editable ? "drag" : ""}" role="button" tabindex="0"><circle cx="${entity.point.x}" cy="${entity.point.y}" r="${entity.selected || entity.related ? 7 : 5}"/><text x="${entity.point.x + 10}" y="${entity.point.y + 4}">${esc(entity.name)}</text></g>`).join("")}</g>
  <g>${data.events.map((event) => event.start ? `<g data-select="${esc(event.id)}" class="event ${event.selected ? "selected" : ""} ${event.related ? "related" : ""}" role="button" tabindex="0"><line class="track" x1="${event.start.x}" y1="${event.start.y}" x2="${event.end.x}" y2="${event.end.y}"/><line class="connector" stroke="${event.color}" x1="${event.start.x}" y1="${event.start.y}" x2="${event.end.x}" y2="${event.end.y}"/><circle fill="${event.color}" cx="${event.start.x}" cy="${event.start.y}" r="${5 + Math.min(5, event.roles.length)}"/><circle fill="${event.color}" cx="${event.end.x}" cy="${event.end.y}" r="4"/>${event.selected || event.related ? `<text x="${(event.start.x + event.end.x) / 2}" y="${event.start.y - 16}" text-anchor="middle">${esc(event.name)}</text>` : ""}</g>` : "").join("")}</g>
  </svg>`;
const inspector = (data) => {
  const item = data.inspector;
  if (!item) return `<aside class="inspector"><p>未选择节点</p></aside>`;
  const detail = item.kind === "event" ? `${formatHour(item.time.start)} — ${formatHour(item.time.end ?? item.time.start)}` : item.kind;
  return `<aside class="inspector"><p class="eyebrow">${item.kind === "event" ? "SELECTED EVENT" : "SELECTED NODE"}</p><h3>${esc(item.name)}</h3><p class="id">${esc(item.id)}</p><div class="detail"><label>${item.kind === "event" ? "时间" : "类型"}</label><strong>${esc(detail)}</strong><small>${item.kind === "event" ? "事件位置由关系目标的几何中心实时计算" : "实体世界位置会被两个投影共同观察"}</small></div><div class="relations">${item.relations.map((relation) => `<div class="relation"><span>${esc(relation.role)}</span><strong>${esc(relation.name)}</strong><small>${esc(relation.kind)}</small></div>`).join("")}</div><div class="rule">event.yz = average(relations[].node.yz)</div></aside>`;
};
const formatHour = (hour) => `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`;
export const renderView = (data) => `<style>${styles}</style><section class="panel"><header class="header"><div><p class="eyebrow">SCENE / EVENT OBSERVER</p><h2>小明的今天</h2></div><span class="mode">${data.mode === "quadrant" ? "单象限" : "管道"}</span></header><p class="story"><span>今天</span>小明 08:00 从家出发并送早餐；随后购买 BTC 和烤鸡。</p><div class="workspace"><section class="stage"><div class="controls">${controls(data)}</div>${svg(data)}<div class="legend"><span>○ 实体</span><span>● 事件</span><span>┄ 关系</span></div></section>${inspector(data)}</div></section>`;
