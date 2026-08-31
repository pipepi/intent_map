/** 在指定画布位置搜索并选择节点或系统插件创建能力。 */
import { useMemo, useState } from "react";
import type {
  RelationCreator,
} from "../contracts/package-types.ts";
import styles from "./creator-window.module.css";

export type CreatorChoice = Pick<
  RelationCreator,
  "id" | "label" | "description" | "category" | "icon"
> & {
  provider: "host" | "system" | "node-type";
};

type NodeCreatorProps = {
  candidates: CreatorChoice[];
  onChoose: (choice: CreatorChoice) => void;
  onCancel: () => void;
};

export function NodeCreator({
  candidates,
  onChoose,
  onCancel,
}: NodeCreatorProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const filtered = useMemo(
    () => candidates.filter((item) =>
      `${item.label} ${item.description ?? ""} ${item.category}`
        .toLowerCase()
        .includes(query.toLowerCase())
    ),
    [candidates, query],
  );

  return <div
    className={styles.creator}
    role="dialog"
    aria-label="创建节点"
    onPointerDown={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((value) => Math.min(filtered.length - 1, value + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((value) => Math.max(0, value - 1));
      }
      if (event.key === "Enter" && filtered[active]) {
        onChoose(filtered[active]);
      }
    }}
  >
    <input
      autoFocus
      value={query}
      onChange={(event) => {
        setQuery(event.target.value);
        setActive(0);
      }}
      placeholder="搜索节点或工作区工具…"
    />
    <div>
      {filtered.map((item, index) => <button
        type="button"
        key={`${item.provider}:${item.id}`}
        className={index === active ? styles.creatorActive : ""}
        onClick={() => onChoose(item)}
      >
        <b>{item.icon ?? (item.provider === "system" ? "⚙" : "◇")}</b>
        <span>
          <strong>{item.label}</strong>
          <small>{item.category} · {item.description}</small>
        </span>
      </button>)}
    </div>
    {!filtered.length && <p>没有匹配的创建能力</p>}
  </div>;
}
