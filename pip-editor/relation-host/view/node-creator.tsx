import { useMemo, useState } from "react";
import type { RelationCreator, WorkspacePoint } from "../contracts/package-types.ts";
import styles from "./relation-host.module.css";

export type CreatorChoice = Pick<RelationCreator, "id" | "label" | "description" | "category" | "icon"> & { provider: "system" | "node-type" };
export function NodeCreator({ point, candidates, onChoose, onCancel }: {
  point: WorkspacePoint; candidates: CreatorChoice[]; onChoose: (id: string) => void; onCancel: () => void;
}) {
  const [query, setQuery] = useState(""), [active, setActive] = useState(0);
  const filtered = useMemo(() => candidates.filter((item) => `${item.label} ${item.description ?? ""} ${item.category}`.toLowerCase().includes(query.toLowerCase())), [candidates, query]);
  return <div className={styles.creator} style={{ left: point.x, top: point.y }} role="dialog" aria-label="创建节点"
    onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(filtered.length - 1, value + 1)); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
      if (event.key === "Enter" && filtered[active]) onChoose(filtered[active].id);
    }}>
    <input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} placeholder="搜索节点或工作区工具…" />
    <div>{filtered.map((item, index) => <button type="button" key={item.id} className={index === active ? styles.creatorActive : ""} onClick={() => onChoose(item.id)}>
      <b>{item.icon ?? (item.provider === "system" ? "⚙" : "◇")}</b><span><strong>{item.label}</strong><small>{item.category} · {item.description}</small></span>
    </button>)}</div>
    {!filtered.length && <p>没有匹配的创建能力</p>}
  </div>;
}
