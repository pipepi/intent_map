"use client";

import { useState } from "react";
import type { CanvasNode, NodeTypeDefinition } from "./types";
import styles from "./editor.module.css";

type Props = {
  node: CanvasNode;
  definition?: NodeTypeDefinition;
  onValueChange: (key: string, value: string) => void;
};

function ImageElement({ value }: { value: string }) {
  const [failedUrl, setFailedUrl] = useState("");
  if (!value) return <div className={styles.imagePlaceholder}>输入图片 URL 后显示图片</div>;
  let valid = false;
  try { valid = ["http:", "https:"].includes(new URL(value).protocol); } catch { /* invalid */ }
  if (!valid) return <div className={styles.imageError}>仅支持 HTTP/HTTPS 图片地址</div>;
  if (failedUrl === value) return <div className={styles.imageError}>图片加载失败</div>;
  return <img className={styles.nodeImage} src={value} alt="节点图片" onError={() => setFailedUrl(value)} />;
}

export function NodeRenderer({ node, definition, onValueChange }: Props) {
  if (!definition) return <div className={styles.orphan}><strong>{node.name}</strong><p>插件已卸载，无法渲染类型 {node.type}</p></div>;
  return <>
    <div className={styles.nodeHeading}><strong>{node.name}</strong><span>{definition.displayName}</span></div>
    <div className={styles.preview}>
      {definition.ui.elements.map((element, index) => element.kind === "image"
        ? <ImageElement key={`${element.sourceField}-${index}`} value={node.values[element.sourceField] ?? ""} />
        : <p key={`${element.sourceField}-${index}`}>{node.values[element.sourceField] || "等待输入文本…"}</p>)}
    </div>
    <div className={styles.fields}>
      {definition.fields.map((field) => <label key={field.key}>{field.label}
        {field.control === "textarea"
          ? <textarea value={node.values[field.key] ?? ""} onChange={(event) => onValueChange(field.key, event.target.value)} />
          : <input value={node.values[field.key] ?? ""} onChange={(event) => onValueChange(field.key, event.target.value)} />}
      </label>)}
    </div>
  </>;
}
